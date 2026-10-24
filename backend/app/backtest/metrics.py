"""
回测指标计算 - 专业级回测分析
参考 vnpy 的绩效分析模块
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass


@dataclass
class BacktestMetrics:
    """回测绩效指标"""
    
    # 收益指标
    total_return: float  # 总收益率
    annual_return: float  # 年化收益率
    annual_volatility: float  # 年化波动率
    
    # 风险指标
    max_drawdown: float  # 最大回撤
    max_drawdown_duration: int  # 最大回撤持续时间(天)
    calmar_ratio: float  # 卡玛比率
    
    # 风险调整收益
    sharpe_ratio: float  # 夏普比率
    sortino_ratio: float  # 索提诺比率
    information_ratio: float  # 信息比率
    
    # 交易统计
    trade_count: int  # 总交易次数
    win_rate: float  # 胜率
    profit_loss_ratio: float  # 盈亏比
    avg_trade_return: float  # 单笔平均收益
    avg_profit: float  # 平均盈利
    avg_loss: float  # 平均亏损
    max_consecutive_wins: int  # 最大连续盈利次数
    max_consecutive_losses: int  # 最大连续亏损次数
    
    # 时间分析
    avg_trade_duration: float  # 平均持仓天数
    avg_win_duration: float  # 盈利交易平均持仓
    avg_loss_duration: float  # 亏损交易平均持仓
    
    # 资金曲线
    equity_curve: List[Dict[str, Any]]
    daily_returns: List[float]
    
    # 月度收益
    monthly_returns: Dict[str, float]
    
    # 基准对比
    alpha: float  # Alpha
    beta: float  # Beta
    
    # 其他
    skewness: float  # 偏度
    kurtosis: float  # 峰度
    var_95: float  # 95% VaR
    cvar_95: float  # 95% CVaR


class MetricsCalculator:
    """回测指标计算器"""
    
    @staticmethod
    def calculate_all_metrics(equity_curve: List[Dict[str, Any]], 
                             trades: List[Any],
                             initial_capital: float = 100000.0,
                             benchmark_returns: Optional[List[float]] = None) -> BacktestMetrics:
        """
        计算所有回测指标
        """
        if not equity_curve or len(equity_curve) < 2:
            return MetricsCalculator._empty_metrics()
        
        # 提取权益和日期
        equity_values = [p['equity'] for p in equity_curve]
        dates = [p['date'] for p in equity_curve]
        
        # 计算日收益率
        daily_returns = []
        for i in range(1, len(equity_values)):
            daily_return = (equity_values[i] - equity_values[i-1]) / equity_values[i-1]
            daily_returns.append(daily_return)
        
        # ========== 收益指标 ==========
        total_return = (equity_values[-1] - initial_capital) / initial_capital
        
        # 年化收益率
        days = len(equity_curve)
        annual_return = (1 + total_return) ** (252 / days) - 1 if days > 0 else 0
        
        # 年化波动率
        annual_volatility = np.std(daily_returns) * np.sqrt(252) if daily_returns else 0
        
        # ========== 风险指标 ==========
        max_drawdown, max_dd_duration = MetricsCalculator._calculate_drawdown(equity_values)
        
        # 卡玛比率
        calmar_ratio = annual_return / max_drawdown if max_drawdown > 0 else 0
        
        # ========== 风险调整收益 ==========
        # 夏普比率 (假设无风险利率为2%)
        risk_free_rate = 0.02
        excess_returns = [r - risk_free_rate/252 for r in daily_returns]
        sharpe_ratio = (np.mean(excess_returns) / np.std(excess_returns) * np.sqrt(252)) \
                       if excess_returns and np.std(excess_returns) > 0 else 0
        
        # 索提诺比率 (只考虑下行波动)
        downside_returns = [r for r in daily_returns if r < 0]
        downside_std = np.std(downside_returns) * np.sqrt(252) if downside_returns else 0
        sortino_ratio = (annual_return - risk_free_rate) / downside_std if downside_std > 0 else 0
        
        # 信息比率
        information_ratio = 0
        if benchmark_returns and len(benchmark_returns) == len(daily_returns):
            tracking_error = np.std([a - b for a, b in zip(daily_returns, benchmark_returns)]) * np.sqrt(252)
            if tracking_error > 0:
                avg_excess = np.mean([a - b for a, b in zip(daily_returns, benchmark_returns)]) * 252
                information_ratio = avg_excess / tracking_error
        
        # ========== 交易统计 ==========
        trade_metrics = MetricsCalculator._calculate_trade_metrics(trades, dates)
        
        # ========== 时间分析 ==========
        duration_metrics = MetricsCalculator._calculate_duration_metrics(trades)
        
        # ========== 月度收益 ==========
        monthly_returns = MetricsCalculator._calculate_monthly_returns(equity_curve)
        
        # ========== Alpha/Beta ==========
        alpha, beta = 0, 1
        if benchmark_returns and len(benchmark_returns) == len(daily_returns):
            alpha, beta = MetricsCalculator._calculate_alpha_beta(daily_returns, benchmark_returns)
        
        # ========== 其他指标 ==========
        skewness = float(pd.Series(daily_returns).skew()) if len(daily_returns) > 2 else 0
        skewness = 0 if pd.isna(skewness) else skewness
        kurtosis = float(pd.Series(daily_returns).kurt()) if len(daily_returns) > 3 else 0
        kurtosis = 0 if pd.isna(kurtosis) else kurtosis
        
        # VaR and CVaR
        var_95 = np.percentile(daily_returns, 5) if daily_returns else 0
        cvar_95 = np.mean([r for r in daily_returns if r <= var_95]) if daily_returns else 0
        
        return BacktestMetrics(
            total_return=total_return * 100,
            annual_return=annual_return * 100,
            annual_volatility=annual_volatility * 100,
            max_drawdown=max_drawdown * 100,
            max_drawdown_duration=max_dd_duration,
            calmar_ratio=calmar_ratio,
            sharpe_ratio=sharpe_ratio,
            sortino_ratio=sortino_ratio,
            information_ratio=information_ratio,
            trade_count=trade_metrics['trade_count'],
            win_rate=trade_metrics['win_rate'] * 100,
            profit_loss_ratio=trade_metrics['profit_loss_ratio'],
            avg_trade_return=trade_metrics['avg_trade_return'] * 100,
            avg_profit=trade_metrics['avg_profit'],
            avg_loss=trade_metrics['avg_loss'],
            max_consecutive_wins=trade_metrics['max_consecutive_wins'],
            max_consecutive_losses=trade_metrics['max_consecutive_losses'],
            avg_trade_duration=duration_metrics['avg_duration'],
            avg_win_duration=duration_metrics['avg_win_duration'],
            avg_loss_duration=duration_metrics['avg_loss_duration'],
            equity_curve=equity_curve,
            daily_returns=daily_returns,
            monthly_returns=monthly_returns,
            alpha=alpha,
            beta=beta,
            skewness=skewness,
            kurtosis=kurtosis,
            var_95=var_95 * 100,
            cvar_95=cvar_95 * 100
        )
    
    @staticmethod
    def _calculate_drawdown(equity_values: List[float]) -> tuple:
        """计算最大回撤和持续时间"""
        max_dd = 0.0
        max_dd_duration = 0
        current_dd_duration = 0
        peak = equity_values[0]
        peak_idx = 0
        
        for i, equity in enumerate(equity_values):
            if equity > peak:
                peak = equity
                peak_idx = i
                current_dd_duration = 0
            else:
                current_dd_duration = i - peak_idx
                dd = (peak - equity) / peak
                if dd > max_dd:
                    max_dd = dd
                    max_dd_duration = current_dd_duration
        
        return max_dd, max_dd_duration
    
    @staticmethod
    def _calculate_trade_metrics(trades: List[Any], dates: List[Any]) -> Dict[str, Any]:
        """计算交易统计指标"""
        if not trades:
            return {
                'trade_count': 0,
                'win_rate': 0,
                'profit_loss_ratio': 0,
                'avg_trade_return': 0,
                'avg_profit': 0,
                'avg_loss': 0,
                'max_consecutive_wins': 0,
                'max_consecutive_losses': 0
            }
        
        # 盈亏统计
        profits = [t.return_pct for t in trades if t.return_pct > 0]
        losses = [t.return_pct for t in trades if t.return_pct <= 0]
        
        win_rate = len(profits) / len(trades) if trades else 0
        
        # 盈亏比
        avg_profit = np.mean(profits) if profits else 0
        avg_loss = abs(np.mean(losses)) if losses else 0
        profit_loss_ratio = avg_profit / avg_loss if avg_loss > 0 else 0
        
        # 平均收益
        avg_trade_return = np.mean([t.return_pct for t in trades])
        
        # 最大连续盈亏
        consecutive_wins = 0
        consecutive_losses = 0
        max_consecutive_wins = 0
        max_consecutive_losses = 0
        
        for trade in trades:
            if trade.return_pct > 0:
                consecutive_wins += 1
                consecutive_losses = 0
                max_consecutive_wins = max(max_consecutive_wins, consecutive_wins)
            else:
                consecutive_losses += 1
                consecutive_wins = 0
                max_consecutive_losses = max(max_consecutive_losses, consecutive_losses)
        
        return {
            'trade_count': len(trades),
            'win_rate': win_rate,
            'profit_loss_ratio': profit_loss_ratio,
            'avg_trade_return': avg_trade_return,
            'avg_profit': avg_profit * 100,  # 转为百分比
            'avg_loss': avg_loss * 100,
            'max_consecutive_wins': max_consecutive_wins,
            'max_consecutive_losses': max_consecutive_losses
        }
    
    @staticmethod
    def _calculate_duration_metrics(trades: List[Any]) -> Dict[str, float]:
        """计算持仓时间指标"""
        if not trades:
            return {
                'avg_duration': 0,
                'avg_win_duration': 0,
                'avg_loss_duration': 0
            }
        
        durations = []
        win_durations = []
        loss_durations = []
        
        for trade in trades:
            if hasattr(trade, 'entry_date') and hasattr(trade, 'exit_date'):
                if trade.exit_date:
                    duration = (pd.to_datetime(trade.exit_date) - 
                               pd.to_datetime(trade.entry_date)).days
                    durations.append(duration)
                    
                    if trade.return_pct > 0:
                        win_durations.append(duration)
                    else:
                        loss_durations.append(duration)
        
        return {
            'avg_duration': np.mean(durations) if durations else 0,
            'avg_win_duration': np.mean(win_durations) if win_durations else 0,
            'avg_loss_duration': np.mean(loss_durations) if loss_durations else 0
        }
    
    @staticmethod
    def _calculate_monthly_returns(equity_curve: List[Dict[str, Any]]) -> Dict[str, float]:
        """计算月度收益率"""
        if not equity_curve:
            return {}
        
        monthly_returns = {}
        
        # 按月份分组
        df = pd.DataFrame(equity_curve)
        df['date'] = pd.to_datetime(df['date'])
        df['month'] = df['date'].dt.to_period('M')
        
        for month, group in df.groupby('month'):
            if len(group) >= 2:
                month_return = (group['equity'].iloc[-1] - group['equity'].iloc[0]) / group['equity'].iloc[0]
                monthly_returns[str(month)] = month_return * 100
        
        return monthly_returns
    
    @staticmethod
    def _calculate_alpha_beta(returns: List[float], benchmark_returns: List[float]) -> tuple:
        """计算Alpha和Beta"""
        if len(returns) != len(benchmark_returns) or len(returns) == 0:
            return 0, 1
        
        returns_arr = np.array(returns)
        benchmark_arr = np.array(benchmark_returns)
        
        # Beta = Cov(returns, benchmark) / Var(benchmark)
        covariance = np.cov(returns_arr, benchmark_arr)[0, 1]
        benchmark_variance = np.var(benchmark_arr)
        
        beta = covariance / benchmark_variance if benchmark_variance > 0 else 1
        
        # Alpha = Mean(returns) - Beta * Mean(benchmark)
        alpha = np.mean(returns_arr) - beta * np.mean(benchmark_arr)
        
        return alpha * 252 * 100, beta  # 年化Alpha转为百分比
    
    @staticmethod
    def _empty_metrics() -> BacktestMetrics:
        """返回空指标"""
        return BacktestMetrics(
            total_return=0,
            annual_return=0,
            annual_volatility=0,
            max_drawdown=0,
            max_drawdown_duration=0,
            calmar_ratio=0,
            sharpe_ratio=0,
            sortino_ratio=0,
            information_ratio=0,
            trade_count=0,
            win_rate=0,
            profit_loss_ratio=0,
            avg_trade_return=0,
            avg_profit=0,
            avg_loss=0,
            max_consecutive_wins=0,
            max_consecutive_losses=0,
            avg_trade_duration=0,
            avg_win_duration=0,
            avg_loss_duration=0,
            equity_curve=[],
            daily_returns=[],
            monthly_returns={},
            alpha=0,
            beta=1,
            skewness=0,
            kurtosis=0,
            var_95=0,
            cvar_95=0
        )


class ReportGenerator:
    """回测报告生成器"""
    
    @staticmethod
    def generate_summary(metrics: BacktestMetrics) -> str:
        """生成文字摘要"""
        summary = f"""
====================================
       回测绩效报告
====================================

【收益指标】
总收益率:     {metrics.total_return:.2f}%
年化收益率:   {metrics.annual_return:.2f}%
年化波动率:   {metrics.annual_volatility:.2f}%

【风险指标】
最大回撤:     {metrics.max_drawdown:.2f}%
回撤持续:     {metrics.max_drawdown_duration}天
卡玛比率:     {metrics.calmar_ratio:.2f}
VaR(95%):     {metrics.var_95:.2f}%
CVaR(95%):    {metrics.cvar_95:.2f}%

【风险调整收益】
夏普比率:     {metrics.sharpe_ratio:.2f}
索提诺比率:   {metrics.sortino_ratio:.2f}
信息比率:     {metrics.information_ratio:.2f}
Alpha:        {metrics.alpha:.2f}%
Beta:         {metrics.beta:.2f}

【交易统计】
交易次数:     {metrics.trade_count}
胜率:         {metrics.win_rate:.2f}%
盈亏比:       {metrics.profit_loss_ratio:.2f}
平均收益:     {metrics.avg_trade_return:.2f}%
平均盈利:     {metrics.avg_profit:.2f}%
平均亏损:     {metrics.avg_loss:.2f}%
连续盈利:     {metrics.max_consecutive_wins}次
连续亏损:     {metrics.max_consecutive_losses}次

【持仓分析】
平均持仓:     {metrics.avg_trade_duration:.1f}天
盈利持仓:     {metrics.avg_win_duration:.1f}天
亏损持仓:     {metrics.avg_loss_duration:.1f}天

====================================
        """
        return summary
    
    @staticmethod
    def generate_monthly_heatmap_data(monthly_returns: Dict[str, float]) -> List[List[Any]]:
        """生成月度收益热力图数据"""
        # 转换为DataFrame
        data = []
        for month_str, ret in monthly_returns.items():
            month = pd.to_datetime(month_str)
            data.append({
                'year': month.year,
                'month': month.month,
                'return': ret
            })
        
        if not data:
            return []
        
        df = pd.DataFrame(data)
        
        # 创建透视表
        pivot = df.pivot(index='year', columns='month', values='return')
        pivot = pivot.fillna(0)
        
        # 转换为前端可用格式
        heatmap_data = []
        for year in pivot.index:
            for month in range(1, 13):
                if month in pivot.columns:
                    heatmap_data.append({
                        'year': year,
                        'month': month,
                        'return': round(pivot.loc[year, month], 2)
                    })
                else:
                    heatmap_data.append({
                        'year': year,
                        'month': month,
                        'return': None
                    })
        
        return heatmap_data
