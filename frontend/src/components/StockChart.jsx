import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Select, Radio, Button, Space, Tooltip, Badge, Tag } from 'antd';
import { 
  StockOutlined, 
  ReloadOutlined, 
  FullscreenOutlined,
  LineChartOutlined,
  BarChartOutlined,
  ExpandOutlined,
  CompressOutlined,
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import { LuxuryCard, LoadingState, EmptyState, ChangeDisplay } from './Common';

/**
 * 股票K线图表组件 - 黑金奢华风格
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称
 * @param {string} className - CSS类名
 * @param {object} style - 样式对象
 */
const StockChart = ({ symbol, name, className = '', style = {} }) => {
  const [period, setPeriod] = useState('daily'); // daily, weekly, monthly
  const [indicator, setIndicator] = useState(['ma', 'volume', 'macd', 'kdj']); // 指标显示
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stockInfo, setStockInfo] = useState(null);
  const chartRef = useRef(null);

  // 获取K线数据
  const fetchKlineData = useCallback(async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`/api/v1/stocks/${symbol}/kline`, {
        params: { period, limit: 120 }
      });
      
      const data = response.data;
      if (data && data.klines && data.klines.length > 0) {
        setChartData(data);
        // 提取股票基本信息
        const latest = data.klines[data.klines.length - 1];
        const prev = data.klines[data.klines.length - 2];
        setStockInfo({
          current: latest.close,
          prevClose: prev?.close || latest.open,
          high: data.klines.reduce((max, k) => Math.max(max, k.high), 0),
          low: data.klines.reduce((min, k) => Math.min(min, k.low), Infinity),
          volume: latest.volume,
          totalVolume: data.klines.reduce((sum, k) => sum + k.volume, 0)
        });
      } else {
        setError('暂无数据');
        // 使用模拟数据展示效果
        setChartData(generateMockData());
      }
    } catch (err) {
      console.error('获取K线数据失败:', err);
      setError('获取数据失败，使用模拟数据');
      setChartData(generateMockData());
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  // 生成模拟数据
  const generateMockData = () => {
    const klines = [];
    let basePrice = 100;
    for (let i = 0; i < 60; i++) {
      const change = (Math.random() - 0.48) * 5;
      const open = basePrice;
      const close = basePrice + change;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      const volume = Math.floor(Math.random() * 1000000) + 500000;
      const date = new Date();
      date.setDate(date.getDate() - (60 - i));
      
      klines.push({
        date: date.toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        volume
      });
      basePrice = close;
    }
    
    const latest = klines[klines.length - 1];
    const prev = klines[klines.length - 2];
    setStockInfo({
      current: latest.close,
      prevClose: prev?.close || latest.open,
      high: klines.reduce((max, k) => Math.max(max, k.high), 0),
      low: klines.reduce((min, k) => Math.min(min, k.low), Infinity),
      volume: latest.volume,
      totalVolume: klines.reduce((sum, k) => sum + k.volume, 0)
    });
    
    return { symbol, name: name || '模拟股票', klines };
  };

  // 初始加载和参数变化时刷新
  useEffect(() => {
    fetchKlineData();
  }, [fetchKlineData]);

  // 计算移动平均线
  const calculateMA = (data, period) => {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push('-');
        continue;
      }
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j][1];
      }
      result.push((sum / period).toFixed(2));
    }
    return result;
  };

  // 计算MACD
  const calculateMACD = (closes, fast = 12, slow = 26, signal = 9) => {
    const ema = (data, period) => {
      const k = 2 / (period + 1);
      const emaData = [data[0]];
      for (let i = 1; i < data.length; i++) {
        emaData.push(data[i] * k + emaData[i - 1] * (1 - k));
      }
      return emaData;
    };
    
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    const dif = emaFast.map((v, i) => v - emaSlow[i]);
    const dea = ema(dif, signal);
    const macd = dif.map((v, i) => (v - dea[i]) * 2);
    
    return { dif, dea, macd };
  };

  // 计算KDJ
  const calculateKDJ = (klines, n = 9, m1 = 3, m2 = 3) => {
    const k = [], d = [], j = [];
    let prevK = 50, prevD = 50;
    
    for (let i = 0; i < klines.length; i++) {
      if (i < n - 1) {
        k.push(null);
        d.push(null);
        j.push(null);
        continue;
      }
      
      let high = -Infinity, low = Infinity;
      for (let t = i - n + 1; t <= i; t++) {
        high = Math.max(high, klines[t].high);
        low = Math.min(low, klines[t].low);
      }
      
      const rsv = (klines[i].close - low) / (high - low) * 100;
      const currK = (2 * prevK + rsv) / 3;
      const currD = (2 * prevD + currK) / 3;
      const currJ = 3 * currK - 2 * currD;
      
      k.push(currK.toFixed(2));
      d.push(currD.toFixed(2));
      j.push(currJ.toFixed(2));
      
      prevK = currK;
      prevD = currD;
    }
    
    return { k, d, j };
  };

  // 格式化K线数据
  const formatKlineData = useMemo(() => {
    if (!chartData || !chartData.klines) return null;

    const dates = chartData.klines.map(item => item.date);
    const klines = chartData.klines.map(item => [
      item.open,
      item.close,
      item.low,
      item.high
    ]);
    const volumes = chartData.klines.map(item => item.volume);
    const closes = chartData.klines.map(item => item.close);

    // 计算MA
    const ma5 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 5);
    const ma10 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 10);
    const ma20 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 20);
    const ma60 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 60);

    // 计算MACD
    const macd = indicator.includes('macd') ? calculateMACD(closes) : null;
    
    // 计算KDJ
    const kdj = indicator.includes('kdj') ? calculateKDJ(chartData.klines) : null;

    return { dates, klines, volumes, ma5, ma10, ma20, ma60, macd, kdj, closes };
  }, [chartData, indicator]);

  // 黑金风格配色
  const colors = {
    up: '#10b981',
    upGlow: 'rgba(16, 185, 129, 0.3)',
    down: '#ef4444',
    downGlow: 'rgba(239, 68, 68, 0.3)',
    gold: '#d4a853',
    goldLight: '#e8c87a',
    ma5: '#d4a853',
    ma10: '#3b82f6',
    ma20: '#a855f7',
    ma60: '#6b7280',
    grid: 'rgba(41, 37, 36, 0.5)',
    text: '#a8a29e',
    textPrimary: '#fafaf9'
  };

  // ECharts配置 - 黑金奢华风格
  const getChartOption = useMemo(() => {
    if (!formatKlineData) return {};

    const { dates, klines, volumes, ma5, ma10, ma20, ma60, macd, kdj } = formatKlineData;
    const showVolume = indicator.includes('volume');
    const showMA = indicator.includes('ma');
    const showMACD = indicator.includes('macd');
    const showKDJ = indicator.includes('kdj');
    
    // 优化布局：主图 + 副图（成交量/MACD/KDJ 紧凑排列）
    const hasSubIndicator = showVolume || showMACD || showKDJ;
    const subIndicatorCount = [showVolume, showMACD, showKDJ].filter(Boolean).length;
    
    // 主图占 60-65%，副图共享剩余空间
    const mainHeight = hasSubIndicator ? '60%' : '85%';
    const subHeight = hasSubIndicator ? `${(35 / subIndicatorCount).toFixed(1)}%` : '0%';
    
    let currentTop = 50;
    const grids = [];
    const xAxes = [];
    const yAxes = [];
    
    // 主图 - K线 + MA
    grids.push({ left: '3%', right: '3%', top: currentTop, height: mainHeight });
    xAxes.push({
      type: 'category',
      gridIndex: 0,
      data: dates,
      scale: true,
      boundaryGap: false,
      axisLine: { lineStyle: { color: colors.grid } },
      axisLabel: { show: !hasSubIndicator, color: colors.text, fontSize: 10 },
      splitLine: { show: false }
    });
    yAxes.push({
      gridIndex: 0,
      scale: true,
      splitArea: { show: false },
      splitLine: { lineStyle: { color: colors.grid, opacity: 0.3 } },
      axisLabel: { 
        color: colors.text, 
        fontSize: 10,
        fontFamily: 'JetBrains Mono'
      }
    });
    
    let gridIndex = 1;
    
    // 副图1: 成交量（如果启用）
    if (showVolume) {
      currentTop += parseInt(mainHeight) + 8;
      grids.push({ 
        left: '3%', 
        right: '3%', 
        top: currentTop, 
        height: subHeight,
        show: true,
        borderColor: colors.grid,
        borderWidth: { top: 1, right: 0, bottom: 0, left: 0 }
      });
      xAxes.push({
        type: 'category',
        gridIndex: gridIndex,
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { show: false },
        axisLabel: { show: !showMACD && !showKDJ, color: colors.text, fontSize: 10 },
        splitLine: { show: false }
      });
      yAxes.push({
        gridIndex: gridIndex,
        scale: true,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      });
      gridIndex++;
    }
    
    // 副图2: MACD（如果启用）
    if (showMACD) {
      currentTop += parseInt(subHeight) + 8;
      grids.push({ 
        left: '3%', 
        right: '3%', 
        top: currentTop, 
        height: subHeight,
        show: true,
        borderColor: colors.grid,
        borderWidth: { top: 1, right: 0, bottom: 0, left: 0 }
      });
      xAxes.push({
        type: 'category',
        gridIndex: gridIndex,
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { show: false },
        axisLabel: { show: !showKDJ, color: colors.text, fontSize: 10 },
        splitLine: { show: false }
      });
      yAxes.push({
        gridIndex: gridIndex,
        scale: true,
        axisLabel: { 
          show: true,
          color: colors.text, 
          fontSize: 9,
          fontFamily: 'JetBrains Mono'
        },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false }
      });
      gridIndex++;
    }
    
    // 副图3: KDJ（如果启用）
    if (showKDJ) {
      currentTop += parseInt(subHeight) + 8;
      grids.push({ 
        left: '3%', 
        right: '3%', 
        top: currentTop, 
        height: subHeight,
        show: true,
        borderColor: colors.grid,
        borderWidth: { top: 1, right: 0, bottom: 0, left: 0 }
      });
      xAxes.push({
        type: 'category',
        gridIndex: gridIndex,
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.text, fontSize: 10 },
        splitLine: { show: false }
      });
      yAxes.push({
        gridIndex: gridIndex,
        scale: true,
        max: 100,
        min: 0,
        axisLabel: { 
          color: colors.text, 
          fontSize: 9,
          fontFamily: 'JetBrains Mono'
        },
        splitLine: { lineStyle: { color: colors.grid, opacity: 0.3 } },
        axisLine: { show: false }
      });
    }

    const series = [
      // K线
      {
        name: 'K线',
        type: 'candlestick',
        data: klines.map((item) => {
          const isUp = item[1] >= item[0];
          return {
            value: [item[0], item[1], item[2], item[3]],
            itemStyle: {
              color: isUp ? colors.up : colors.down,
              color0: isUp ? colors.up : colors.down,
              borderColor: isUp ? colors.up : colors.down,
              borderColor0: isUp ? colors.up : colors.down,
              shadowBlur: 10,
              shadowColor: isUp ? colors.upGlow : colors.downGlow
            }
          };
        })
      },
      // MA线
      ...(showMA ? [
        { name: 'MA5', type: 'line', data: ma5, smooth: true, lineStyle: { color: colors.ma5, width: 1.5 }, symbol: 'none' },
        { name: 'MA10', type: 'line', data: ma10, smooth: true, lineStyle: { color: colors.ma10, width: 1.5 }, symbol: 'none' },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, lineStyle: { color: colors.ma20, width: 1.5 }, symbol: 'none' },
        { name: 'MA60', type: 'line', data: ma60, smooth: true, lineStyle: { color: colors.ma60, width: 1.5 }, symbol: 'none' }
      ] : []),
      // 成交量
      ...(showVolume ? [{
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes.map((vol, index) => {
          const isUp = klines[index][1] >= klines[index][0];
          return {
            value: vol,
            itemStyle: {
              color: isUp ? colors.up : colors.down,
              opacity: 0.8
            }
          };
        })
      }] : []),
      // MACD
      ...(showMACD ? [
        {
          name: 'DIF',
          type: 'line',
          xAxisIndex: showVolume ? 2 : 1,
          yAxisIndex: showVolume ? 2 : 1,
          data: macd.dif,
          smooth: true,
          lineStyle: { color: colors.gold, width: 1.5 },
          symbol: 'none'
        },
        {
          name: 'DEA',
          type: 'line',
          xAxisIndex: showVolume ? 2 : 1,
          yAxisIndex: showVolume ? 2 : 1,
          data: macd.dea,
          smooth: true,
          lineStyle: { color: colors.ma10, width: 1.5 },
          symbol: 'none'
        },
        {
          name: 'MACD',
          type: 'bar',
          xAxisIndex: showVolume ? 2 : 1,
          yAxisIndex: showVolume ? 2 : 1,
          data: macd.macd.map((v, i) => ({
            value: v,
            itemStyle: {
              color: v >= 0 ? colors.up : colors.down,
              opacity: 0.8
            }
          }))
        }
      ] : []),
      // KDJ
      ...(showKDJ ? [
        {
          name: 'K',
          type: 'line',
          xAxisIndex: gridIndex - 1,
          yAxisIndex: gridIndex - 1,
          data: kdj.k,
          smooth: true,
          lineStyle: { color: colors.gold, width: 1.5 },
          symbol: 'none'
        },
        {
          name: 'D',
          type: 'line',
          xAxisIndex: gridIndex - 1,
          yAxisIndex: gridIndex - 1,
          data: kdj.d,
          smooth: true,
          lineStyle: { color: colors.ma10, width: 1.5 },
          symbol: 'none'
        },
        {
          name: 'J',
          type: 'line',
          xAxisIndex: gridIndex - 1,
          yAxisIndex: gridIndex - 1,
          data: kdj.j,
          smooth: true,
          lineStyle: { color: colors.ma20, width: 1.5 },
          symbol: 'none'
        }
      ] : [])
    ];

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 500,
      tooltip: {
        trigger: 'axis',
        axisPointer: { 
          type: 'cross',
          lineStyle: {
            color: colors.gold,
            opacity: 0.5
          }
        },
        backgroundColor: 'rgba(17, 17, 24, 0.95)',
        borderColor: colors.gold,
        borderWidth: 1,
        textStyle: { 
          color: colors.textPrimary,
          fontFamily: 'Plus Jakarta Sans'
        },
        formatter: function (params) {
          let tooltip = `<div style="font-weight:bold;margin-bottom:8px;color:${colors.gold};font-family:JetBrains Mono">${params[0].axisValue}</div>`;
          params.forEach(param => {
            if (param.seriesName === 'K线') {
              const data = param.data;
              const isUp = data.value[1] >= data.value[0];
              const change = ((data.value[1] - data.value[0]) / data.value[0] * 100).toFixed(2);
              tooltip += `
                <div style="margin:4px 0;font-size:12px">
                  <span style="display:inline-block;width:8px;height:8px;background:${isUp ? colors.up : colors.down};margin-right:6px;border-radius:50%;box-shadow:0 0 4px ${isUp ? colors.upGlow : colors.downGlow}"></span>
                  <span style="color:${colors.text}">开盘:</span> <span style="font-family:JetBrains Mono;color:${colors.textPrimary}">${data.value[0]}</span> | 
                  <span style="color:${colors.text}">收盘:</span> <span style="font-family:JetBrains Mono;color:${isUp ? colors.up : colors.down};font-weight:600">${data.value[1]} (${change > 0 ? '+' : ''}${change}%)</span> | 
                  <span style="color:${colors.text}">最低:</span> <span style="font-family:JetBrains Mono;color:${colors.textPrimary}">${data.value[2]}</span> | 
                  <span style="color:${colors.text}">最高:</span> <span style="font-family:JetBrains Mono;color:${colors.textPrimary}">${data.value[3]}</span>
                </div>
              `;
            } else if (param.seriesName === '成交量') {
              tooltip += `
                <div style="margin:4px 0;font-size:12px">
                  <span style="display:inline-block;width:8px;height:8px;background:${param.color};margin-right:6px;border-radius:2px"></span>
                  <span style="color:${colors.text}">成交量:</span> <span style="font-family:JetBrains Mono;color:${colors.textPrimary}">${(param.value / 10000).toFixed(2)}万</span>
                </div>
              `;
            } else {
              tooltip += `
                <div style="margin:4px 0;font-size:12px">
                  <span style="color:${param.color};margin-right:6px;font-weight:bold">●</span>
                  <span style="color:${colors.text}">${param.seriesName}:</span> <span style="font-family:JetBrains Mono;color:${colors.textPrimary}">${param.value}</span>
                </div>
              `;
            }
          });
          return tooltip;
        }
      },
      legend: {
        data: ['K线', 'MA5', 'MA10', 'MA20', 'MA60', '成交量', 'DIF', 'DEA', 'MACD', 'K', 'D', 'J'],
        textStyle: { 
          color: colors.text,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 11
        },
        top: 5,
        itemGap: 15
      },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: xAxes.map((_, i) => i),
          start: 50,
          end: 100
        },
        {
          show: true,
          xAxisIndex: xAxes.map((_, i) => i),
          type: 'slider',
          top: '94%',
          height: '20px',
          start: 50,
          end: 100,
          backgroundColor: 'rgba(26, 26, 36, 0.8)',
          borderColor: colors.grid,
          fillerColor: 'rgba(212, 168, 83, 0.2)',
          handleStyle: { 
            color: colors.gold,
            borderColor: colors.gold,
            borderWidth: 2
          },
          textStyle: { color: colors.text, fontSize: 10 }
        }
      ],
      series
    };
  }, [formatKlineData, indicator]);

  // 处理全屏
  const handleFullscreen = () => {
    if (chartRef.current) {
      const element = chartRef.current.getEchartsInstance().getDom();
      if (document.fullscreenElement) {
        document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        element.requestFullscreen();
        setIsFullscreen(true);
      }
    }
  };

  // 监听全屏变化
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // 周期选项
  const periodOptions = [
    { label: '日K', value: 'daily' },
    { label: '周K', value: 'weekly' },
    { label: '月K', value: 'monthly' }
  ];

  // 指标选项
  const indicatorOptions = [
    { label: 'MA均线', value: 'ma', icon: <LineChartOutlined /> },
    { label: '成交量', value: 'volume', icon: <BarChartOutlined /> },
    { label: 'MACD', value: 'macd' },
    { label: 'KDJ', value: 'kdj' }
  ];

  // 计算涨跌幅
  const changePercent = stockInfo ? 
    ((stockInfo.current - stockInfo.prevClose) / stockInfo.prevClose * 100).toFixed(2) : 0;

  return (
    <LuxuryCard 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <StockOutlined style={{ color: 'var(--gold-primary)', fontSize: '18px' }} />
          <span style={{ fontFamily: 'var(--font-display)' }}>K线图表</span>
          {symbol && (
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginLeft: '12px'
            }}>
              <Tag 
                style={{ 
                  background: 'rgba(212, 168, 83, 0.1)',
                  borderColor: 'var(--border-gold)',
                  color: 'var(--gold-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                {symbol}
              </Tag>
              {name && (
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {name}
                </span>
              )}
            </div>
          )}
        </div>
      }
      className={className}
      style={style}
      headerAction={
        stockInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '20px',
                fontWeight: '600',
                color: changePercent >= 0 ? 'var(--up-color)' : 'var(--down-color)'
              }}>
                {stockInfo.current?.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '2px' }}>
                <ChangeDisplay value={changePercent} />
              </div>
            </div>
          </div>
        )
      }
    >
      {/* 股票信息栏 */}
      {stockInfo && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>最高</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--up-color)', marginTop: '2px' }}>
                {stockInfo.high?.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>最低</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--down-color)', marginTop: '2px' }}>
                {stockInfo.low?.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>成交量</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
                {(stockInfo.volume / 10000).toFixed(2)}万
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* 周期选择 */}
        <Radio.Group 
          value={period} 
          onChange={(e) => setPeriod(e.target.value)}
          optionType="button"
          size="small"
          style={{
            '.ant-radio-button-wrapper': {
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)'
            }
          }}
        >
          {periodOptions.map(opt => (
            <Radio.Button key={opt.value} value={opt.value}>
              {opt.label}
            </Radio.Button>
          ))}
        </Radio.Group>

        {/* 指标选择 */}
        <Select
          mode="multiple"
          value={indicator}
          onChange={setIndicator}
          size="small"
          style={{ width: 240 }}
          placeholder="选择技术指标"
          options={indicatorOptions.map(opt => ({
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {opt.icon}
                {opt.label}
              </span>
            ),
            value: opt.value
          }))}
          tagRender={(props) => (
            <Tag
              closable={props.closable}
              onClose={props.onClose}
              style={{
                background: 'rgba(212, 168, 83, 0.1)',
                borderColor: 'var(--border-gold)',
                color: 'var(--gold-primary)',
                fontSize: '11px'
              }}
            >
              {props.label}
            </Tag>
          )}
        />

        {/* 操作按钮 */}
        <Space>
          <Tooltip title="刷新">
            <Button 
              icon={<ReloadOutlined />} 
              size="small"
              onClick={fetchKlineData}
              loading={loading}
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)'
              }}
            />
          </Tooltip>
          <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
            <Button 
              icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />} 
              size="small"
              onClick={handleFullscreen}
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-secondary)'
              }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 图表区域 */}
      <div style={{ height: isFullscreen ? 'calc(100vh - 200px)' : '520px', position: 'relative' }}>
        {loading ? (
          <LoadingState text="加载K线数据..." />
        ) : error ? (
          <EmptyState 
            title={error}
            description="正在使用模拟数据展示"
          />
        ) : formatKlineData ? (
          <ReactECharts
            ref={chartRef}
            option={getChartOption}
            style={{ height: '100%', width: '100%' }}
            theme="dark"
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <EmptyState 
            title="选择股票查看K线图"
            description="在搜索框输入股票代码"
          />
        )}
      </div>
    </LuxuryCard>
  );
};

export default StockChart;
