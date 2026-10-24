"""防过拟合回测的单元测试：python -m pytest tests -q（在 backend 目录下运行）"""
import numpy as np
import pandas as pd
import pytest

from app.backtest.robust import (
    CostModel, block_bootstrap, check_lookahead, robust_backtest, simulate, split_indices,
)
from app.backtest.metrics import MetricsCalculator


def make_df(n=300, seed=0, drift=0.0005):
    rng = np.random.default_rng(seed)
    close = 10 * np.exp(np.cumsum(rng.normal(drift, 0.02, n)))
    open_ = close * (1 + rng.normal(0, 0.005, n))
    high = np.maximum(open_, close) * 1.01
    low = np.minimum(open_, close) * 0.99
    vol = rng.integers(1_000_000, 5_000_000, n).astype(float)
    dates = pd.bdate_range("2023-01-02", periods=n)
    return pd.DataFrame({"date": dates, "open": open_, "high": high, "low": low,
                         "close": close, "volume": vol})


def test_cost_floor_cannot_be_lowered():
    with pytest.raises(ValueError):
        CostModel(commission=0.0)
    with pytest.raises(ValueError):
        CostModel(slippage=0.0001)
    CostModel(commission=0.0003, stamp_duty=0.001, slippage=0.002)  # 调高可以


def test_split_is_chronological_and_disjoint():
    seg = split_indices(300)
    assert seg["train"][0] == 60
    assert seg["train"][1] == seg["val"][0]
    assert seg["val"][1] == seg["test"][0]
    assert seg["test"][1] == 300


def test_split_rejects_too_little_data():
    with pytest.raises(ValueError):
        split_indices(100)


def test_lookahead_passes_for_causal_indicators():
    res = check_lookahead(make_df(), {})
    assert res["passed"], res["issues"]
    assert "RSI" in res["checked_columns"]


def test_lookahead_detects_future_leak():
    def leaky(df, params):
        df = df.copy()
        df["future_ret"] = df["close"].shift(-1) / df["close"] - 1  # 偷看明天
        df["centered_ma"] = df["close"].rolling(5, center=True).mean()
        return df
    res = check_lookahead(make_df(), {}, indicator_fn=leaky)
    assert not res["passed"]
    assert {i["column"] for i in res["issues"]} >= {"future_ret", "centered_ma"}


def test_trade_executes_at_next_open_with_costs():
    df = make_df(100)
    n = len(df)
    scores = np.full(n, 50.0)
    trends = np.array(["neutral"] * n, dtype=object)
    scores[70], trends[70] = 90.0, "up"   # 第 70 根收盘出买入信号
    scores[80] = 10.0                     # 第 80 根收盘出卖出信号
    costs = CostModel()
    out = simulate(df, scores, trends, {}, 60, 100, costs=costs,
                   stop_loss_pct=9, take_profit_pct=9)
    t = out["trades"][0]
    assert pd.Timestamp(t["entry_date"]) == df["date"].iloc[71]
    assert pd.Timestamp(t["exit_date"]) == df["date"].iloc[81]
    assert t["entry_price"] == pytest.approx(df["open"].iloc[71] * (1 + costs.slippage), abs=1e-4)
    gross = df["open"].iloc[81] / df["open"].iloc[71] - 1
    assert t["return_pct"] / 100 < gross  # 扣成本后一定低于毛收益


def test_flat_signal_no_trades():
    df = make_df(100)
    n = len(df)
    out = simulate(df, np.full(n, 50.0), np.array(["neutral"] * n, dtype=object), {}, 60, 100)
    assert out["metrics"]["trade_count"] == 0
    assert out["metrics"]["total_return_pct"] == pytest.approx(0.0)


def test_bootstrap():
    assert block_bootstrap([1, 2])["valid"] is False
    res = block_bootstrap([1.0] * 20, n_iter=50)
    assert res["profitable_ratio"] == 1.0
    res = block_bootstrap([-1.0] * 20, n_iter=50)
    assert res["profitable_ratio"] == 0.0


def test_robust_backtest_end_to_end():
    df = make_df(320, seed=3)
    grid = [{"rsi_period": p, "buy_threshold": b, "sell_threshold": 35}
            for p in (10, 14) for b in (55, 60)]
    res = robust_backtest(df, grid, n_bootstrap=50)
    assert res["lookahead_check"]["passed"]
    assert res["tested_combinations"] == 4
    assert set(res["split"]) == {"train", "val", "test"}
    sel = res["selected"]
    assert set(sel) >= {"params", "train", "val", "test"}
    # 测试集交易全部落在测试区间内
    test_start = pd.Timestamp(res["split"]["test"]["start"])
    for t in sel["test_trades"]:
        assert pd.Timestamp(t["entry_date"]) >= test_start
    assert "disclaimer" in res


def test_selection_does_not_depend_on_test_segment():
    """改动测试段的价格，选出的参数不能变——证明 test 没参与选参。"""
    df = make_df(320, seed=5)
    grid = [{"rsi_period": p, "buy_threshold": b} for p in (10, 14) for b in (55, 60)]
    a = robust_backtest(df, grid, n_bootstrap=20)
    seg = split_indices(len(df))
    df2 = df.copy()
    s = seg["test"][0]
    df2.loc[s:, ["open", "high", "low", "close"]] *= np.linspace(1, 0.5, len(df2) - s)[:, None]
    b = robust_backtest(df2, grid, n_bootstrap=20)
    assert a["selected"]["params"] == b["selected"]["params"]
    assert a["selected"]["val"] == b["selected"]["val"]


def test_analyzer_supports_nondefault_ma_periods():
    """参数网格会生成 ma_medium=15/30，分析器必须能算出对应均线。"""
    from app.strategies.indicators import SignalAnalyzer
    sig = SignalAnalyzer({"ma_short": 10, "ma_medium": 15, "ma_long": 60}).analyze(make_df(120))
    assert "MA" in sig


def test_metrics_skew_kurtosis_no_crash():
    curve = [{"date": d, "equity": 100000 * (1 + 0.001 * i)}
             for i, d in enumerate(pd.bdate_range("2024-01-01", periods=30))]
    m = MetricsCalculator.calculate_all_metrics(curve, [], 100000)
    assert np.isfinite(m.skewness) and np.isfinite(m.kurtosis)
