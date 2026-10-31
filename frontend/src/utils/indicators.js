/**
 * 前端技术指标（纯函数，便于测试）。
 * 输入为按时间升序的 K 线：[{ date, open, high, low, close, volume }]
 * 输出为 lightweight-charts 可直接 setData 的 [{ time, value }]，预热期不输出。
 * 口径对齐通达信 / 同花顺：MACD 柱 = 2 × (DIF − DEA)，RSI 用 Wilder 平滑，BOLL 用样本标准差。
 */

/** 简单移动平均 */
export const sma = (klines, period, key = 'close') => {
  const out = [];
  if (!Array.isArray(klines) || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    sum += klines[i][key];
    if (i >= period) sum -= klines[i - period][key];
    if (i >= period - 1) out.push({ time: klines[i].date, value: sum / period });
  }
  return out;
};

/** EMA 序列（首值为种子），返回与输入等长的数值数组 */
export const emaValues = (values, period) => {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
};

/** MACD：返回 { dif, dea, hist }，hist 带涨跌色 */
export const macd = (klines, fast = 12, slow = 26, signal = 9, colors = {}) => {
  const empty = { dif: [], dea: [], hist: [] };
  if (!Array.isArray(klines) || klines.length === 0) return empty;
  const closes = klines.map((k) => k.close);
  const emaFast = emaValues(closes, fast);
  const emaSlow = emaValues(closes, slow);
  const difVals = emaFast.map((v, i) => v - emaSlow[i]);
  const deaVals = emaValues(difVals, signal);

  const result = { dif: [], dea: [], hist: [] };
  klines.forEach((k, i) => {
    const h = 2 * (difVals[i] - deaVals[i]);
    result.dif.push({ time: k.date, value: difVals[i] });
    result.dea.push({ time: k.date, value: deaVals[i] });
    result.hist.push({
      time: k.date,
      value: h,
      ...(colors.up && colors.down ? { color: h >= 0 ? colors.up : colors.down } : {}),
    });
  });
  return result;
};

/** RSI（Wilder 平滑，即通达信 SMA(X,N,1)） */
export const rsi = (klines, period = 14) => {
  const out = [];
  if (!Array.isArray(klines) || klines.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = klines[i].close - klines[i - 1].close;
    if (d > 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  const value = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out.push({ time: klines[period].date, value: value() });

  for (let i = period + 1; i < klines.length; i++) {
    const d = klines[i].close - klines[i - 1].close;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: klines[i].date, value: value() });
  }
  return out;
};

/** 布林带：返回 { upper, middle, lower }，标准差为样本标准差（与后端 pandas 一致） */
export const bollinger = (klines, period = 20, mult = 2) => {
  const result = { upper: [], middle: [], lower: [] };
  if (!Array.isArray(klines) || klines.length < period || period < 2) return result;
  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += klines[j].close;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (klines[j].close - mean) ** 2;
    const sd = Math.sqrt(sq / (period - 1));
    const time = klines[i].date;
    result.middle.push({ time, value: mean });
    result.upper.push({ time, value: mean + mult * sd });
    result.lower.push({ time, value: mean - mult * sd });
  }
  return result;
};
