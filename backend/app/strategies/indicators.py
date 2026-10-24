"""
技术指标计算模块
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass


@dataclass
class SignalResult:
    """信号结果"""
    value: float
    signal: int  # -1, 0, 1
    description: str


class TechnicalIndicators:
    """技术指标计算器"""
    
    @staticmethod
    def calculate_ma(df: pd.DataFrame, periods: List[int] = [5, 10, 20, 60]) -> pd.DataFrame:
        """计算移动平均线"""
        for period in periods:
            df[f'MA{period}'] = df['close'].rolling(window=period).mean()
        return df
    
    @staticmethod
    def calculate_ema(df: pd.DataFrame, periods: List[int] = [12, 26]) -> pd.DataFrame:
        """计算指数移动平均线"""
        for period in periods:
            df[f'EMA{period}'] = df['close'].ewm(span=period, adjust=False).mean()
        return df
    
    @staticmethod
    def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
        """
        计算RSI相对强弱指标
        RSI = 100 - (100 / (1 + RS))
        RS = 平均上涨 / 平均下跌
        """
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        rs = gain / loss
        df['RSI'] = 100 - (100 / (1 + rs))
        return df
    
    @staticmethod
    def calculate_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
        """
        计算MACD指标
        MACD = EMA(12) - EMA(26)
        Signal = EMA(MACD, 9)
        Histogram = MACD - Signal
        """
        ema_fast = df['close'].ewm(span=fast, adjust=False).mean()
        ema_slow = df['close'].ewm(span=slow, adjust=False).mean()
        
        df['MACD'] = ema_fast - ema_slow
        df['MACD_Signal'] = df['MACD'].ewm(span=signal, adjust=False).mean()
        df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']
        return df
    
    @staticmethod
    def calculate_bollinger(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
        """
        计算布林带
        中轨 = MA(20)
        上轨 = 中轨 + 2 * STD(20)
        下轨 = 中轨 - 2 * STD(20)
        """
        df['BB_Middle'] = df['close'].rolling(window=period).mean()
        bb_std = df['close'].rolling(window=period).std()
        df['BB_Upper'] = df['BB_Middle'] + (bb_std * std_dev)
        df['BB_Lower'] = df['BB_Middle'] - (bb_std * std_dev)
        df['BB_Width'] = (df['BB_Upper'] - df['BB_Lower']) / df['BB_Middle']
        df['BB_Position'] = (df['close'] - df['BB_Lower']) / (df['BB_Upper'] - df['BB_Lower'])
        return df
    
    @staticmethod
    def calculate_kdj(df: pd.DataFrame, n: int = 9, m1: int = 3, m2: int = 3) -> pd.DataFrame:
        """
        计算KDJ随机指标
        RSV = (收盘价 - N日内最低价) / (N日内最高价 - N日内最低价) * 100
        K = 2/3 * 昨日K + 1/3 * 当日RSV
        D = 2/3 * 昨日D + 1/3 * 当日K
        J = 3K - 2D
        """
        low_list = df['low'].rolling(window=n, min_periods=n).min()
        high_list = df['high'].rolling(window=n, min_periods=n).max()
        rsv = (df['close'] - low_list) / (high_list - low_list) * 100
        
        df['K'] = rsv.ewm(com=m1-1, adjust=False).mean()
        df['D'] = df['K'].ewm(com=m2-1, adjust=False).mean()
        df['J'] = 3 * df['K'] - 2 * df['D']
        return df
    
    @staticmethod
    def calculate_volume_indicators(df: pd.DataFrame) -> pd.DataFrame:
        """计算成交量指标"""
        # 成交量均线
        df['Vol_MA5'] = df['volume'].rolling(window=5).mean()
        df['Vol_MA20'] = df['volume'].rolling(window=20).mean()
        
        # 量比（当前成交量/前5日均量）
        df['Volume_Ratio'] = df['volume'] / df['volume'].rolling(window=5).mean()
        
        # OBV能量潮
        df['OBV'] = (np.sign(df['close'].diff()) * df['volume']).cumsum()
        
        return df
    
    @staticmethod
    def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
        """计算ATR真实波动幅度"""
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = np.max(ranges, axis=1)
        
        df['ATR'] = true_range.rolling(window=period).mean()
        return df


class SignalAnalyzer:
    """信号分析器"""
    
    def __init__(self, params: Dict[str, Any] = None):
        self.params = params or {}
        self.ti = TechnicalIndicators()
    
    def analyze(self, df: pd.DataFrame) -> Dict[str, SignalResult]:
        """
        对股票数据进行综合分析，生成多个技术信号
        """
        if len(df) < 60:
            return {}
        
        signals = {}
        
        # 计算所有指标（均线周期要包含参数里的 ma_short/medium/long，否则取列时 KeyError）
        ma_periods = sorted({5, 10, 20, 60,
                             int(self.params.get('ma_short', 5)),
                             int(self.params.get('ma_medium', 20)),
                             int(self.params.get('ma_long', 60))})
        df = self.ti.calculate_ma(df, ma_periods)
        df = self.ti.calculate_rsi(df, self.params.get('rsi_period', 14))
        df = self.ti.calculate_macd(df, 
                                    self.params.get('macd_fast', 12),
                                    self.params.get('macd_slow', 26),
                                    self.params.get('macd_signal', 9))
        df = self.ti.calculate_bollinger(df)
        df = self.ti.calculate_kdj(df)
        df = self.ti.calculate_volume_indicators(df)
        
        latest = df.iloc[-1]
        
        # 1. RSI信号
        rsi = latest['RSI']
        rsi_overbought = self.params.get('rsi_overbought', 70)
        rsi_oversold = self.params.get('rsi_oversold', 30)
        
        if rsi > rsi_overbought:
            rsi_signal = -1
            rsi_desc = f"RSI超买 ({rsi:.1f} > {rsi_overbought})"
        elif rsi < rsi_oversold:
            rsi_signal = 1
            rsi_desc = f"RSI超卖 ({rsi:.1f} < {rsi_oversold})"
        else:
            rsi_signal = 0
            rsi_desc = f"RSI中性 ({rsi:.1f})"
        
        signals['RSI'] = SignalResult(rsi, rsi_signal, rsi_desc)
        
        # 2. MACD信号
        macd = latest['MACD']
        macd_signal = latest['MACD_Signal']
        macd_hist = latest['MACD_Hist']
        
        if macd > macd_signal and macd_hist > 0:
            macd_sig = 1
            macd_desc = "MACD金叉，多头趋势"
        elif macd < macd_signal and macd_hist < 0:
            macd_sig = -1
            macd_desc = "MACD死叉，空头趋势"
        else:
            macd_sig = 0
            macd_desc = "MACD趋势不明"
        
        signals['MACD'] = SignalResult(macd, macd_sig, macd_desc)
        
        # 3. 均线系统信号
        ma_short = self.params.get('ma_short', 5)
        ma_medium = self.params.get('ma_medium', 20)
        ma_long = self.params.get('ma_long', 60)
        
        price = latest['close']
        ma5 = latest[f'MA{ma_short}']
        ma20 = latest[f'MA{ma_medium}']
        ma60 = latest[f'MA{ma_long}']
        
        # 多头排列：价格 > MA5 > MA20 > MA60
        if price > ma5 > ma20 > ma60:
            ma_signal = 1
            ma_desc = "均线多头排列，强势上涨"
        # 空头排列：价格 < MA5 < MA20 < MA60
        elif price < ma5 < ma20 < ma60:
            ma_signal = -1
            ma_desc = "均线空头排列，弱势下跌"
        # 金叉/死叉判断
        elif ma5 > ma20 and df.iloc[-2][f'MA{ma_short}'] <= df.iloc[-2][f'MA{ma_medium}']:
            ma_signal = 1
            ma_desc = "MA5上穿MA20，金叉买入信号"
        elif ma5 < ma20 and df.iloc[-2][f'MA{ma_short}'] >= df.iloc[-2][f'MA{ma_medium}']:
            ma_signal = -1
            ma_desc = "MA5下穿MA20，死叉卖出信号"
        else:
            ma_signal = 0
            ma_desc = "均线趋势不明"
        
        signals['MA'] = SignalResult(ma5/price*100, ma_signal, ma_desc)
        
        # 4. 布林带信号
        bb_position = latest['BB_Position']
        bb_width = latest['BB_Width']
        
        if bb_position > 0.8:
            bb_signal = -1
            bb_desc = "价格接近布林上轨，可能回调"
        elif bb_position < 0.2:
            bb_signal = 1
            bb_desc = "价格接近布林下轨，可能反弹"
        elif bb_width < df['BB_Width'].rolling(20).mean().iloc[-1] * 0.8:
            bb_signal = 0
            bb_desc = "布林带收窄，等待突破"
        else:
            bb_signal = 0
            bb_desc = "布林带趋势正常"
        
        signals['Bollinger'] = SignalResult(bb_position * 100, bb_signal, bb_desc)
        
        # 5. KDJ信号
        k = latest['K']
        d = latest['D']
        j = latest['J']
        
        if j > 80 and k < d:
            kdj_signal = -1
            kdj_desc = "KDJ高位死叉"
        elif j < 20 and k > d:
            kdj_signal = 1
            kdj_desc = "KDJ低位金叉"
        else:
            kdj_signal = 0
            kdj_desc = f"KDJ运行中 (K={k:.1f}, D={d:.1f}, J={j:.1f})"
        
        signals['KDJ'] = SignalResult(j, kdj_signal, kdj_desc)
        
        # 6. 成交量信号
        vol_ratio = latest['Volume_Ratio']
        
        if vol_ratio > 2.0:
            vol_signal = 1
            vol_desc = f"放量 ({vol_ratio:.1f}倍)，资金活跃"
        elif vol_ratio > 1.5:
            vol_signal = 0
            vol_desc = f"温和放量 ({vol_ratio:.1f}倍)"
        elif vol_ratio < 0.5:
            vol_signal = -1
            vol_desc = f"缩量 ({vol_ratio:.1f}倍)，交投清淡"
        else:
            vol_signal = 0
            vol_desc = f"量能正常 ({vol_ratio:.1f}倍)"
        
        signals['Volume'] = SignalResult(vol_ratio, vol_signal, vol_desc)
        
        return signals
    
    def calculate_score(self, signals: Dict[str, SignalResult]) -> Tuple[float, float, str]:
        """
        计算综合评分和上涨概率
        
        Returns:
            (综合评分0-100, 上涨概率0-1, 趋势方向)
        """
        if not signals:
            return 50.0, 0.5, "neutral"
        
        # 权重配置
        weights = {
            'RSI': self.params.get('rsi_weight', 0.25),
            'MACD': self.params.get('macd_weight', 0.30),
            'MA': self.params.get('ma_weight', 0.25),
            'Volume': self.params.get('volume_weight', 0.20)
        }
        
        # 计算加权得分
        total_weight = 0
        weighted_score = 0
        bullish_count = 0
        bearish_count = 0
        
        for name, signal in signals.items():
            if name in weights:
                # 将 -1,0,1 映射到 0-100 分数
                if signal.signal == 1:
                    score = 80
                    bullish_count += 1
                elif signal.signal == -1:
                    score = 20
                    bearish_count += 1
                else:
                    score = 50
                
                weighted_score += score * weights[name]
                total_weight += weights[name]
        
        if total_weight > 0:
            final_score = weighted_score / total_weight
        else:
            final_score = 50.0
        
        # 计算上涨概率（基于得分和信号一致性）
        signal_strength = abs(bullish_count - bearish_count) / max(len(signals), 1)
        up_probability = final_score / 100 * (0.5 + 0.5 * signal_strength)
        up_probability = max(0.1, min(0.9, up_probability))  # 限制在0.1-0.9
        
        # 趋势方向
        if final_score >= 65:
            trend = "up"
        elif final_score <= 35:
            trend = "down"
        else:
            trend = "neutral"
        
        return final_score, up_probability, trend
    
    def calculate_multi_timeframe_prediction(self, df: pd.DataFrame, signals: Dict[str, SignalResult]) -> Dict[str, Any]:
        """
        计算多时间维度预测 (1天、7天)
        
        基于：
        1. 历史波动率 (Volatility)
        2. 趋势强度 (Trend Strength)
        3. 技术信号持续性
        4. 近期价格动量
        """
        if len(df) < 30:
            return {
                'up_prob_1d': 0.5, 'up_prob_7d': 0.5,
                'exp_return_1d': 0, 'exp_return_7d': 0,
                'conf_1d': 0.5, 'conf_7d': 0.5
            }
        
        # 计算历史波动率
        df['returns'] = df['close'].pct_change()
        volatility = df['returns'].tail(20).std() * np.sqrt(252)  # 年化波动率
        
        # 计算近期趋势强度 (RSI + MACD + MA)
        latest = df.iloc[-1]
        
        # 趋势方向得分 (-1 到 1)
        trend_score = 0
        trend_signals = 0
        
        # RSI趋势
        if 'RSI' in signals:
            rsi_sig = signals['RSI']
            trend_score += rsi_sig.signal * 0.3
            trend_signals += 0.3
        
        # MACD趋势
        if 'MACD' in signals:
            macd_sig = signals['MACD']
            trend_score += macd_sig.signal * 0.4
            trend_signals += 0.4
        
        # 均线趋势
        if 'MA' in signals:
            ma_sig = signals['MA']
            trend_score += ma_sig.signal * 0.3
            trend_signals += 0.3
        
        # 标准化趋势得分
        if trend_signals > 0:
            trend_score = trend_score / trend_signals
        
        # 计算动量 (近5日 vs 近20日)
        momentum_5d = (df['close'].iloc[-1] / df['close'].iloc[-5] - 1) if len(df) >= 5 else 0
        momentum_20d = (df['close'].iloc[-1] / df['close'].iloc[-20] - 1) if len(df) >= 20 else 0
        
        # ===== 1天预测 =====
        # 短期预测更依赖即时信号和波动率
        up_prob_1d = 0.5 + trend_score * 0.3
        # 根据波动率调整置信度 - 波动率越高，置信度越低
        conf_1d = 0.7 - min(volatility * 0.5, 0.3)
        # 预期收益率 (基于趋势和动量)
        exp_return_1d = trend_score * volatility * 0.5 + momentum_5d * 0.3
        
        # ===== 7天预测 =====
        # 中期预测更依赖趋势和动量
        # 如果短期趋势和中期动量一致，提高概率
        if trend_score > 0.3 and momentum_20d > 0:
            up_prob_7d = 0.6 + trend_score * 0.25
        elif trend_score < -0.3 and momentum_20d < 0:
            up_prob_7d = 0.4 + trend_score * 0.25
        else:
            up_prob_7d = 0.5 + trend_score * 0.2 + momentum_20d * 0.3
        
        # 7天置信度通常比1天高（趋势更稳定），但受数据质量影响
        conf_7d = 0.65 - min(volatility * 0.3, 0.2)
        
        # 7天预期收益率 (年化调整)
        exp_return_7d = trend_score * volatility * 1.5 + momentum_20d * 0.5
        
        # 限制概率和收益率范围
        up_prob_1d = max(0.1, min(0.9, up_prob_1d))
        up_prob_7d = max(0.1, min(0.9, up_prob_7d))
        exp_return_1d = max(-0.1, min(0.1, exp_return_1d))  # 限制在±10%
        exp_return_7d = max(-0.2, min(0.2, exp_return_7d))  # 限制在±20%
        
        return {
            'up_prob_1d': up_prob_1d,
            'up_prob_7d': up_prob_7d,
            'exp_return_1d': exp_return_1d * 100,  # 转为百分比
            'exp_return_7d': exp_return_7d * 100,
            'conf_1d': conf_7d,
            'conf_7d': conf_7d,
            'volatility': volatility
        }
