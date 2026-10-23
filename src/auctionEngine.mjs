/** AuctionX simulation math. NO blockchain interactions or legal/market guarantees. */
export const AUCTION_FEE_RATE = 0.001; // 0.10% of the winning payment
export const INITIAL_MARGIN_RATE = 0.20; // illustrative 5x maximum on current notional
export const MAX_PRICE_DRIFT = 0.01; // 1% vs auction snapshot
export const AUCTION_TTL_MS = 300_000; // 5 minutes
export const round = value => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
export function positionValue(position, mark) {
  if (!Number.isFinite(mark) || mark <= 0) throw Error('Precio de mercado no disponible.');
  const pnl = (position.side === 'LONG' ? 1 : -1) * (mark - position.entry) * position.qty;
  const equity = position.margin + pnl;
  const notional = Math.abs(position.qty * mark);
  return { pnl:round(pnl), equity:round(equity), notional:round(notional), minimumMargin:round(notional * INITIAL_MARGIN_RATE) };
}
export function buildAuction({ position, mark, minimumPct, now }) {
  if (!position || !position.id) throw Error('Selecciona una posición.');
  const pct = Number(minimumPct);
  if (!Number.isFinite(pct) || pct < 90 || pct > 100) throw Error('El mínimo debe estar entre 90% y 100%.');
  const {equity} = positionValue(position, mark);
  if (equity <= 0) throw Error('No puede subastarse una posición sin patrimonio positivo.');
  return { id:`auction-${position.id}`,positionId:position.id,symbol:position.symbol,referencePrice:mark,minimumPct:pct,createdAt:now,expiresAt:now+AUCTION_TTL_MS,status:'open' };
}
export function quoteTransfer({ auction, position, mark, bidPct, buyerFree, now }) {
  if (auction.status !== 'open') throw Error('La subasta no está abierta.');
  if (now > auction.expiresAt) throw Error('La subasta venció; vuelve a publicarla.');
  if (auction.positionId !== position.id || auction.symbol !== position.symbol) throw Error('Posición de subasta no coincide.');
  const pct = Number(bidPct);
  if (!Number.isFinite(pct) || pct < auction.minimumPct || pct > 100) throw Error('La oferta debe cumplir el mínimo y no exceder el 100%.');
  if (Math.abs(mark / auction.referencePrice - 1) > MAX_PRICE_DRIFT) throw Error('Precio cambió más de 1%. Cancela y publica una nueva subasta.');
  const {equity, notional, minimumMargin} = positionValue(position, mark);
  if (equity <= 0) throw Error('La posición ya no tiene patrimonio positivo.');
  const payment = round(equity*pct/100);
  const topUp = round(Math.max(0,minimumMargin-equity));
  const fee = round(payment*AUCTION_FEE_RATE);
  const required = round(payment+topUp+fee);
  if (!Number.isFinite(buyerFree) || buyerFree < required) throw Error('El comprador B no dispone de suficiente saldo ficticio para el pago, margen adicional y comisión.');
  return {equity,notional,payment,topUp,fee,required,discount:round(equity-payment), buyerInitialMargin:round(equity+topUp)};
}
