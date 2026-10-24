"""
防过拟合回测（仅供研究 / 模拟盘，不构成投资建议）

规范（完整说明见仓库根目录 BACKTEST_RULES.md）：
1. 按时间先后切成 train / val / test，不打乱。参数只在 train、val 上评估、在 val 上选；
   test 在参数选定之后只评估一次，不参与任何选择。
2. 成交：第 t 根 K 线收盘时出信号，第 t+1 根开盘成交（同时满足 A 股 T+1，
   也避免「用收盘价出信号、又按同一个收盘价成交」）。
3. 成本有下限：佣金、印花税、滑点只能调高，不能调低。
4. 未来函数检查：指标在完整数据和截断数据上的重叠部分必须逐值一致。
5. 选「平台」不选「尖峰」：候选参数的得分 = 它和最近邻参数在 val 上得分的中位数。
6. Block Bootstrap：按块重抽 test 的交易序列，看有多大比例的路径最终盈利。
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from app.strategies.indicators import SignalAnalyzer, TechnicalIndicators

TRADING_DAYS = 252
WARMUP_BARS = 60  # SignalAnalyzer.analyze 至少需要 60 根 K 线

DISCLAIMER = (
    "回测结果只反映一段历史数据上的表现，不代表未来收益，不构成投资建议；"
    "本系统仅用于研究与模拟盘，不接入实盘交易。"
)


# ---------------------------------------------------------------------------
# 成本模型
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CostModel:
    """A 股交易成本。默认值同时是下限：可以调高，不能调低。"""

    commission: float = 0.00025  # 佣金，买卖双边，万 2.5
    stamp_duty: float = 0.0005   # 印花税，仅卖出，0.05%
    slippage: float = 0.001      # 滑点，买卖双边，0.1%

    def __post_init__(self):
        for name, floor in CostModel.floors().items():
            value = getattr(self, name)
            if value is None or value < floor:
                raise ValueError(
                    f"成本参数 {name}={value} 低于下限 {floor}。"
                    "回测成本只能调高不能调低，否则结果会被高估。"
                )

    @staticmethod
    def floors() -> Dict[str, float]:
        return {"commission": 0.00025, "stamp_duty": 0.0005, "slippage": 0.001}


# ---------------------------------------------------------------------------
# 数据与指标
# ---------------------------------------------------------------------------
REQUIRED_COLUMNS = ("open", "high", "low", "close", "volume")


def prepare_data(df: pd.DataFrame) -> pd.DataFrame:
    """按日期升序排列、重置索引，并检查必需列。"""
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"行情数据缺少列: {missing}")
    out = df.copy()
    if "date" in out.columns:
        out["date"] = pd.to_datetime(out["date"])
        out = out.sort_values("date")
    else:
        out["date"] = pd.RangeIndex(len(out))
    out = out.reset_index(drop=True)
    for c in REQUIRED_COLUMNS:
        out[c] = out[c].astype(float)
    return out


def default_indicators(df: pd.DataFrame, params: Dict[str, Any]) -> pd.DataFrame:
    """和 SignalAnalyzer.analyze 使用同一套指标计算，用于未来函数检查。"""
    ti = TechnicalIndicators()
    df = df.copy()
    ma_periods = sorted({5, 10, 20, 60,
                         int(params.get("ma_short", 5)),
                         int(params.get("ma_medium", 20)),
                         int(params.get("ma_long", 60))})
    df = ti.calculate_ma(df, ma_periods)
    df = ti.calculate_rsi(df, int(params.get("rsi_period", 14)))
    df = ti.calculate_macd(df,
                           int(params.get("macd_fast", 12)),
                           int(params.get("macd_slow", 26)),
                           int(params.get("macd_signal", 9)))
    df = ti.calculate_bollinger(df)
    df = ti.calculate_kdj(df)
    df = ti.calculate_volume_indicators(df)
    df = ti.calculate_atr(df)
    return df


def check_lookahead(df: pd.DataFrame,
                    params: Dict[str, Any],
                    cut_fracs: Sequence[float] = (0.5, 0.7, 0.9),
                    indicator_fn: Callable[[pd.DataFrame, Dict[str, Any]], pd.DataFrame] = default_indicators,
                    ) -> Dict[str, Any]:
    """
    未来函数检查：分别用完整数据和截断数据计算指标，比较重叠部分。
    如果某个指标在截断数据上的值和在完整数据上的值不同，说明它用到了「之后」的数据。
    """
    df = prepare_data(df)
    n = len(df)
    full = indicator_fn(df.copy(), params)
    base_cols = set(df.columns)
    cols = [c for c in full.columns
            if c not in base_cols and pd.api.types.is_numeric_dtype(full[c])]
    issues: List[Dict[str, Any]] = []
    cuts: List[int] = []
    for frac in cut_fracs:
        k = int(n * frac)
        if k < 30 or k >= n:
            continue
        cuts.append(k)
        part = indicator_fn(df.iloc[:k].copy(), params)
        for col in cols:
            if col not in part.columns:
                issues.append({"column": col, "cut": k, "reason": "截断数据上缺少该列"})
                continue
            a = full[col].iloc[:k].to_numpy(dtype=float)
            b = part[col].to_numpy(dtype=float)
            same = np.isclose(a, b, rtol=1e-9, atol=1e-12, equal_nan=True)
            if not same.all():
                issues.append({
                    "column": col,
                    "cut": k,
                    "first_mismatch_index": int(np.argmax(~same)),
                    "reason": "截断数据与完整数据的指标值不一致，疑似使用了未来数据",
                })
    return {"passed": not issues, "checked_columns": cols, "cuts": cuts, "issues": issues[:50]}


def compute_signal_series(df: pd.DataFrame, params: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray]:
    """
    逐根 K 线计算评分。第 t 根只把 df.iloc[:t+1] 交给分析器，信号构造上就不可能看到未来。
    """
    analyzer = SignalAnalyzer(params)
    n = len(df)
    scores = np.full(n, np.nan)
    trends = np.array(["neutral"] * n, dtype=object)
    for t in range(WARMUP_BARS - 1, n):
        signals = analyzer.analyze(df.iloc[: t + 1].copy())
        if signals:
            score, _, trend = analyzer.calculate_score(signals)
            scores[t] = score
            trends[t] = trend
    return scores, trends


# ---------------------------------------------------------------------------
# 模拟成交
# ---------------------------------------------------------------------------
def simulate(df: pd.DataFrame,
             scores: np.ndarray,
             trends: np.ndarray,
             params: Dict[str, Any],
             start: int,
             end: int,
             costs: Optional[CostModel] = None,
             stop_loss_pct: float = 0.05,
             take_profit_pct: float = 0.10) -> Dict[str, Any]:
    """
    只做多、满仓进出。第 t 根收盘出信号，第 t+1 根开盘成交；区间结束时按最后收盘价扣成本平仓。
    区间之前的数据只用于计算指标（这是过去的数据，不算泄漏），交易和收益只统计 [start, end)。
    """
    costs = costs or CostModel()
    if end - start < 2:
        raise ValueError("回测区间太短")

    buy_th = float(params.get("buy_threshold", 70))
    sell_th = float(params.get("sell_threshold", 30))
    opens = df["open"].to_numpy(dtype=float)
    closes = df["close"].to_numpy(dtype=float)
    dates = df["date"].astype(str).to_numpy()

    state = {"cash": 1.0, "shares": 0.0, "entry_px": 0.0, "entry_basis": 0.0, "entry_date": ""}
    pending: Optional[Tuple[str, str]] = None  # (动作, 原因)
    equity: List[float] = []
    trades: List[Dict[str, Any]] = []

    def close_position(px_raw: float, date: str, reason: str) -> None:
        px = px_raw * (1 - costs.slippage)
        proceeds = state["shares"] * px * (1 - costs.commission - costs.stamp_duty)
        trades.append({
            "entry_date": state["entry_date"],
            "entry_price": round(state["entry_px"], 4),
            "exit_date": date,
            "exit_price": round(px, 4),
            "return_pct": (proceeds / state["entry_basis"] - 1) * 100,
            "reason": reason,
        })
        state["cash"], state["shares"] = proceeds, 0.0

    for t in range(start, end):
        # 1) 以开盘价执行上一根 K 线收盘时下的单
        if pending is not None:
            action, reason = pending
            if action == "buy" and state["shares"] == 0:
                px = opens[t] * (1 + costs.slippage)
                state["entry_basis"] = state["cash"]
                state["shares"] = state["cash"] / (px * (1 + costs.commission))
                state["cash"] = 0.0
                state["entry_px"], state["entry_date"] = px, dates[t]
            elif action == "sell" and state["shares"] > 0:
                close_position(opens[t], dates[t], reason)
            pending = None

        # 2) 收盘估值
        equity.append(state["cash"] + state["shares"] * closes[t])

        # 3) 收盘时决策（只用到第 t 根及之前的信息）；区间最后一根不再下单
        if t == end - 1:
            break
        s = scores[t]
        if np.isnan(s):
            continue
        if state["shares"] == 0:
            if s >= buy_th and trends[t] == "up":
                pending = ("buy", f"评分 {s:.1f} ≥ {buy_th:g}")
        else:
            r = closes[t] / state["entry_px"] - 1
            if r <= -stop_loss_pct:
                pending = ("sell", "止损")
            elif r >= take_profit_pct:
                pending = ("sell", "止盈")
            elif s <= sell_th:
                pending = ("sell", f"评分 {s:.1f} ≤ {sell_th:g}")

    if state["shares"] > 0:
        close_position(closes[end - 1], dates[end - 1], "区间结束平仓")
        equity[-1] = state["cash"]

    buy_hold = closes[end - 1] / closes[start] - 1
    return {"metrics": _metrics(equity, trades, buy_hold), "trades": trades,
            "start_date": dates[start], "end_date": dates[end - 1], "bars": end - start}


def _metrics(equity: List[float], trades: List[Dict[str, Any]], buy_hold: float) -> Dict[str, float]:
    eq = np.asarray([1.0] + list(equity), dtype=float)
    rets = np.diff(eq) / eq[:-1]
    total = eq[-1] - 1
    bars = max(len(equity), 1)
    annual = (1 + total) ** (TRADING_DAYS / bars) - 1 if total > -1 else -1.0
    std = rets.std()
    sharpe = float(rets.mean() / std * math.sqrt(TRADING_DAYS)) if std > 0 else 0.0
    peak = np.maximum.accumulate(eq)
    max_dd = float(((peak - eq) / peak).max())
    wins = [t for t in trades if t["return_pct"] > 0]
    return {
        "total_return_pct": total * 100,
        "annual_return_pct": annual * 100,
        "sharpe": sharpe,
        "max_drawdown_pct": max_dd * 100,
        "trade_count": len(trades),
        "win_rate_pct": (len(wins) / len(trades) * 100) if trades else 0.0,
        "buy_hold_return_pct": buy_hold * 100,
        "excess_return_pct": (total - buy_hold) * 100,
    }


# ---------------------------------------------------------------------------
# 切分、选参、压力测试
# ---------------------------------------------------------------------------
def split_indices(n: int, ratios: Sequence[float] = (0.6, 0.2, 0.2),
                  warmup: int = WARMUP_BARS, min_bars: int = 20) -> Dict[str, Tuple[int, int]]:
    """按时间先后切分 [warmup, n)：前面的 warmup 根 K 线只用于计算指标。"""
    if len(ratios) != 3 or any(r <= 0 for r in ratios) or abs(sum(ratios) - 1) > 1e-6:
        raise ValueError("ratios 必须是三个正数且和为 1")
    usable = n - warmup
    a = warmup + int(usable * ratios[0])
    b = a + int(usable * ratios[1])
    seg = {"train": (warmup, a), "val": (a, b), "test": (b, n)}
    for name, (s, e) in seg.items():
        if e - s < min_bars:
            raise ValueError(
                f"数据不足：{name} 段只有 {max(e - s, 0)} 根 K 线（至少需要 {min_bars}）。"
                f"当前共 {n} 根，建议 ≥ {warmup + min_bars * 5} 根。"
            )
    return seg


def block_bootstrap(trade_returns_pct: Sequence[float], n_iter: int = 500,
                    block: int = 5, seed: int = 42) -> Dict[str, Any]:
    """按连续的块重抽交易序列（保留趋势里的连续性），统计最终盈利路径的比例。"""
    r = np.asarray(trade_returns_pct, dtype=float) / 100
    m = len(r)
    if m < 5:
        return {"valid": False, "trade_count": m,
                "reason": f"交易只有 {m} 笔，样本太少，无法做压力测试"}
    block = max(1, min(block, m))
    rng = np.random.default_rng(seed)
    n_blocks = math.ceil(m / block)
    finals = np.empty(n_iter)
    for i in range(n_iter):
        starts = rng.integers(0, m - block + 1, n_blocks)
        path = np.concatenate([r[s:s + block] for s in starts])[:m]
        finals[i] = np.prod(1 + path) - 1
    return {
        "valid": True,
        "iterations": n_iter,
        "block_size": block,
        "trade_count": m,
        "profitable_ratio": float((finals > 0).mean()),
        "p5_return_pct": float(np.percentile(finals, 5) * 100),
        "p50_return_pct": float(np.percentile(finals, 50) * 100),
        "p95_return_pct": float(np.percentile(finals, 95) * 100),
    }


def _dedupe(grid: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen, out = set(), []
    for p in grid:
        clean = {k: (v.item() if hasattr(v, "item") else v) for k, v in dict(p).items()}
        key = tuple(sorted(clean.items()))
        if key not in seen:
            seen.add(key)
            out.append(clean)
    return out


def _plateau_scores(grid: List[Dict[str, Any]], values: np.ndarray, k: int = 3) -> np.ndarray:
    """每个候选的得分 = 它自身和 k 个最近邻（参数空间归一化距离）得分的中位数。"""
    keys = sorted({key for p in grid for key, v in p.items()
                   if isinstance(v, (int, float)) and not isinstance(v, bool)})
    varying = [key for key in keys if len({p.get(key) for p in grid}) > 1]
    if not varying or len(grid) <= 2:
        return values.copy()
    mat = np.array([[float(p.get(key, 0)) for key in varying] for p in grid])
    lo = mat.min(axis=0)
    span = mat.max(axis=0) - lo
    span[span == 0] = 1
    mat = (mat - lo) / span
    out = np.empty(len(grid))
    for i in range(len(grid)):
        d = np.linalg.norm(mat - mat[i], axis=1)
        idx = np.argsort(d, kind="stable")[: k + 1]  # 包含自身
        out[i] = np.median(values[idx])
    return out


def robust_backtest(df: pd.DataFrame,
                    param_grid: Sequence[Dict[str, Any]],
                    costs: Optional[CostModel] = None,
                    ratios: Sequence[float] = (0.6, 0.2, 0.2),
                    min_trades: int = 3,
                    stop_loss_pct: float = 0.05,
                    take_profit_pct: float = 0.10,
                    n_bootstrap: int = 500,
                    seed: int = 42) -> Dict[str, Any]:
    """防过拟合回测主流程，返回可直接序列化为 JSON 的结果。"""
    costs = costs or CostModel()
    df = prepare_data(df)
    grid = _dedupe(param_grid)
    if not grid:
        raise ValueError("参数网格为空")
    seg = split_indices(len(df), ratios)
    (tr_s, tr_e), (va_s, va_e), (te_s, te_e) = seg["train"], seg["val"], seg["test"]
    kw = dict(costs=costs, stop_loss_pct=stop_loss_pct, take_profit_pct=take_profit_pct)

    # 1) 未来函数检查
    look_issues: List[Dict[str, Any]] = []
    checked_cols: set = set()
    for p in grid:
        res = check_lookahead(df, p)
        checked_cols.update(res["checked_columns"])
        look_issues.extend(res["issues"])
    lookahead = {"passed": not look_issues, "checked_columns": sorted(checked_cols),
                 "issues": look_issues[:20],
                 "note": "信号按 df.iloc[:t+1] 逐根计算，成交在下一根开盘"}

    # 2) 每组参数只看 train、val
    cands: List[Dict[str, Any]] = []
    series: List[Tuple[np.ndarray, np.ndarray]] = []
    for p in grid:
        scores, trends = compute_signal_series(df, p)
        series.append((scores, trends))
        train = simulate(df, scores, trends, p, tr_s, tr_e, **kw)["metrics"]
        val = simulate(df, scores, trends, p, va_s, va_e, **kw)["metrics"]
        cands.append({"params": p, "train": train, "val": val})

    # 3) 在 val 上选「平台」；交易数不足的候选不参与
    eligible = np.array([c["val"]["trade_count"] >= min_trades for c in cands])
    val_sharpe = np.array([c["val"]["sharpe"] for c in cands], dtype=float)
    floor = (val_sharpe[eligible].min() - 1) if eligible.any() else -99.0
    plateau = _plateau_scores(grid, np.where(eligible, val_sharpe, floor))
    for c, ps, ok in zip(cands, plateau, eligible):
        c["plateau_score"] = float(ps) if ok else None
        c["eligible"] = bool(ok)
        c["decay_sharpe"] = c["train"]["sharpe"] - c["val"]["sharpe"]

    warnings: List[str] = []
    if eligible.any():
        order = sorted(np.where(eligible)[0], key=lambda i: (-plateau[i], cands[i]["decay_sharpe"]))
        best_i = int(order[0])
    else:
        best_i = int(np.argmax(val_sharpe))
        warnings.append(f"所有参数在验证集上的交易都少于 {min_trades} 笔，选参没有统计意义。")

    # 4) 参数选定后才碰 test，且只评估一次
    best = cands[best_i]
    scores, trends = series[best_i]
    test_run = simulate(df, scores, trends, best["params"], te_s, te_e, **kw)
    test = test_run["metrics"]
    boot = block_bootstrap([t["return_pct"] for t in test_run["trades"]], n_iter=n_bootstrap, seed=seed)

    # 5) 风险提示
    if not lookahead["passed"]:
        warnings.append("未来函数检查未通过：结果不可信，先修复指标计算。")
    if test["total_return_pct"] <= 0:
        warnings.append("测试集（样本外）收益为负。")
    if test["excess_return_pct"] <= 0:
        warnings.append("测试集收益没有跑赢同期买入持有。")
    if best["train"]["sharpe"] > 0 and best["val"]["sharpe"] < 0.5 * best["train"]["sharpe"]:
        warnings.append("训练集到验证集夏普衰减超过一半，疑似过拟合。")
    if test["trade_count"] < 10:
        warnings.append(f"测试集只有 {test['trade_count']} 笔交易，统计意义有限。")
    if boot.get("valid") and boot["profitable_ratio"] < 0.6:
        warnings.append(f"Block Bootstrap 只有 {boot['profitable_ratio']:.0%} 的路径盈利，优势很薄或不存在。")

    ranked = sorted(cands, key=lambda c: (c["plateau_score"] is None, -(c["plateau_score"] or 0)))
    return _clean({
        "rules_version": 1,
        "disclaimer": DISCLAIMER,
        "bars": len(df),
        "split": {name: {"start": str(df["date"].iloc[s]), "end": str(df["date"].iloc[e - 1]),
                         "bars": e - s} for name, (s, e) in seg.items()},
        "costs": asdict(costs),
        "execution": "第 t 根收盘出信号，第 t+1 根开盘成交；只做多",
        "lookahead_check": lookahead,
        "tested_combinations": len(cands),
        "selection": {"objective": "验证集夏普的平台得分（自身 + 3 个最近邻的中位数）",
                      "min_trades": min_trades},
        "selected": {
            "params": best["params"],
            "train": best["train"],
            "val": best["val"],
            "test": test,
            "plateau_score": best["plateau_score"],
            "test_trades": test_run["trades"],
        },
        "bootstrap": boot,
        "candidates": ranked[:10],
        "warnings": warnings,
    })


def _clean(obj: Any) -> Any:
    """把 numpy 类型和 NaN/Inf 转成 JSON 可序列化的值。"""
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return round(f, 6) if math.isfinite(f) else None
    return obj
