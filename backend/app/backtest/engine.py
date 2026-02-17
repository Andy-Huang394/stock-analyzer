"""
回测引擎
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

from app.strategies.indicators import SignalAnalyzer


@dataclass
class Trade:
    """交易记录"""
    entry_date: datetime
    entry_price: float
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    position: int = 1  # 1多头, -1空头
    pnl: float = 0.0
    return_pct: float = 0.0


class BacktestEngine:
    """回测引擎"""
    
    def __init__(self, initial_capital: float = 100000.0):
        self.initial_capital = initial_capital
        self.capital = initial_capital
        self.trades: List[Trade] = []
        self.equity_curve: List[Dict[str, Any]] = []
        
    def reset(self):
        """重置状态"""
        self.capital = self.initial_capital
        self.trades = []
        self.equity_curve = []
    
    def run_backtest(self, df: pd.DataFrame, params: Dict[str, Any],
                     stop_loss_pct: float = 0.05,
                     take_profit_pct: float = 0.10) -> Dict[str, Any]:
        """
        运行回测
        
        策略逻辑：
        - 综合评分 >= buy_threshold: 买入
        - 综合评分 <= sell_threshold: 卖出
        - 止损：亏损超过 stop_loss_pct
        - 止盈：盈利超过 take_profit_pct
        """
        self.reset()
        
        if len(df) < 30:
            return self._empty_result()
        
        analyzer = SignalAnalyzer(params)
        
        # 逐日回测
        position = 0  # 0空仓, 1持仓
        entry_price = 0.0
        entry_date = None
        
        for i in range(20, len(df)):  # 从第20天开始（需要足够历史数据计算指标）
            current_data = df.iloc[:i+1]
            current_row = df.iloc[i]
            date = current_row['date'] if 'date' in current_row else current_row.name
            price = current_row['close']
            
            # 获取信号和评分
            signals = analyzer.analyze(current_data)
            score, up_prob, trend = analyzer.calculate_score(signals)
            
            buy_threshold = params.get('buy_threshold', 70)
            sell_threshold = params.get('sell_threshold', 30)
            
            # 记录权益
            if position == 1:
                unrealized_pnl = (price - entry_price) / entry_price
                current_equity = self.capital * (1 + unrealized_pnl)
            else:
                current_equity = self.capital
            
            self.equity_curve.append({
                'date': date,
                'equity': current_equity,
                'price': price,
                'score': score,
                'position': position
            })
            
            # 交易逻辑
            if position == 0:  # 空仓
                if score >= buy_threshold and trend == 'up':
                    # 买入信号
                    position = 1
                    entry_price = price
                    entry_date = date
                    
            elif position == 1:  # 持仓
                return_pct = (price - entry_price) / entry_price
                
                # 检查止损
                if return_pct <= -stop_loss_pct:
                    # 止损卖出
                    self._close_trade(entry_date, entry_price, date, price, return_pct)
                    position = 0
                    entry_price = 0
                    
                # 检查止盈
                elif return_pct >= take_profit_pct:
                    # 止盈卖出
                    self._close_trade(entry_date, entry_price, date, price, return_pct)
                    position = 0
                    entry_price = 0
                    
                # 检查卖出信号
                elif score <= sell_threshold:
                    # 信号卖出
                    self._close_trade(entry_date, entry_price, date, price, return_pct)
                    position = 0
                    entry_price = 0
        
        # 回测结束，如果还有持仓则平仓
        if position == 1 and entry_price > 0:
            last_row = df.iloc[-1]
            last_date = last_row['date'] if 'date' in last_row else last_row.name
            last_price = last_row['close']
            return_pct = (last_price - entry_price) / entry_price
            self._close_trade(entry_date, entry_price, last_date, last_price, return_pct)
        
        return self._calculate_metrics(params)
    
    def _close_trade(self, entry_date, entry_price, exit_date, exit_price, return_pct):
        """记录交易"""
        pnl = self.capital * return_pct
        self.capital += pnl
        
        trade = Trade(
            entry_date=entry_date,
            entry_price=entry_price,
            exit_date=exit_date,
            exit_price=exit_price,
            pnl=pnl,
            return_pct=return_pct
        )
        self.trades.append(trade)
    
    def _calculate_metrics(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """计算回测指标"""
        if not self.trades:
            return self._empty_result()
        
        # 基础统计
        total_return = (self.capital - self.initial_capital) / self.initial_capital
        
        # 计算年化收益率
        if len(self.equity_curve) > 1:
            days = len(self.equity_curve)
            annual_return = (1 + total_return) ** (252 / days) - 1
        else:
            annual_return = 0
        
        # 胜率
        profit_trades = [t for t in self.trades if t.pnl > 0]
        loss_trades = [t for t in self.trades if t.pnl <= 0]
        win_rate = len(profit_trades) / len(self.trades) if self.trades else 0
        
        # 最大回撤
        max_drawdown = self._calculate_max_drawdown()
        
        # 夏普比率（简化版）
        if len(self.equity_curve) > 1:
            returns = []
            for i in range(1, len(self.equity_curve)):
                daily_return = (self.equity_curve[i]['equity'] - self.equity_curve[i-1]['equity']) / self.equity_curve[i-1]['equity']
                returns.append(daily_return)
            
            if returns and np.std(returns) > 0:
                sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252)
            else:
                sharpe_ratio = 0
        else:
            sharpe_ratio = 0
        
        # 交易记录
        trade_records = []
        for t in self.trades:
            trade_records.append({
                'entry_date': str(t.entry_date),
                'entry_price': t.entry_price,
                'exit_date': str(t.exit_date) if t.exit_date else None,
                'exit_price': t.exit_price,
                'return_pct': t.return_pct * 100,
                'pnl': t.pnl
            })
        
        return {
            'params': params,
            'total_return': total_return * 100,  # 百分比
            'annual_return': annual_return * 100,
            'max_drawdown': max_drawdown * 100,
            'sharpe_ratio': sharpe_ratio,
            'win_rate': win_rate * 100,
            'trade_count': len(self.trades),
            'profit_trades': len(profit_trades),
            'loss_trades': len(loss_trades),
            'equity_curve': self.equity_curve,
            'trades': trade_records,
            'final_capital': self.capital
        }
    
    def _calculate_max_drawdown(self) -> float:
        """计算最大回撤"""
        if not self.equity_curve:
            return 0.0
        
        max_dd = 0.0
        peak = self.equity_curve[0]['equity']
        
        for point in self.equity_curve:
            equity = point['equity']
            if equity > peak:
                peak = equity
            dd = (peak - equity) / peak
            max_dd = max(max_dd, dd)
        
        return max_dd
    
    def _empty_result(self) -> Dict[str, Any]:
        """空结果"""
        return {
            'params': {},
            'total_return': 0,
            'annual_return': 0,
            'max_drawdown': 0,
            'sharpe_ratio': 0,
            'win_rate': 0,
            'trade_count': 0,
            'profit_trades': 0,
            'loss_trades': 0,
            'equity_curve': [],
            'trades': [],
            'final_capital': self.initial_capital
        }
    
    def optimize_parameters(self, df: pd.DataFrame, 
                          param_grid: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        参数优化
        
        遍历参数网格，找到最优参数组合
        """
        results = []
        
        for params in param_grid:
            result = self.run_backtest(df, params)
            result['params'] = params
            results.append(result)
        
        # 按综合得分排序
        results.sort(key=lambda x: (
            x['total_return'] * 0.4 +
            x['sharpe_ratio'] * 10 * 0.3 +
            (100 - abs(x['max_drawdown'])) * 0.2 +
            x['win_rate'] * 0.1
        ), reverse=True)
        
        return results[0] if results else None, results
