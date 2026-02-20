import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { 
  Card, Row, Col, Select, Button, Space, Switch, Tooltip, 
  Tabs, Statistic, Badge, Divider
} from 'antd';
import { 
  SyncOutlined, SettingOutlined, LineChartOutlined,
  BarChartOutlined, ReloadOutlined, FullscreenOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { LuxuryCard, LoadingState, ChangeDisplay } from './Common';

const { Option } = Select;
const { TabPane } = Tabs;

/**
 * 专业K线图表组件
 * 基于 lightweight-charts (TradingView)
 */
const StockChartPro = ({ symbol: initialSymbol, height = 600 }) => {
  const chartContainerRef = useRef(null);
  const chart = useRef(null);
  const candlestickSeries = useRef(null);
  const volumeSeries = useRef(null);
  const maSeries = useRef({});
  
  const [symbol, setSymbol] = useState(initialSymbol || '600519');
  const [period, setPeriod] = useState('daily');
  const [loading, setLoading] = useState(false);
  const [klineData, setKlineData] = useState([]);
  const [indicators, setIndicators] = useState({
    ma5: true,
    ma10: true,
    ma20: true,
    ma60: false,
    volume: true,
    macd: false,
    rsi: false,
    boll: false
  });
  const [stockInfo, setStockInfo] = useState(null);
  const [hoverData, setHoverData] = useState(null);

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 创建图表
    const chartInstance = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(197, 203, 206, 0.1)' },
        horzLines: { color: 'rgba(197, 203, 206, 0.1)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#758696',
          labelBackgroundColor: '#758696',
        },
        horzLine: {
          color: '#758696',
          labelBackgroundColor: '#758696',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.2)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chart.current = chartInstance;

    // 创建K线系列
    candlestickSeries.current = chartInstance.addCandlestickSeries({
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderVisible: false,
      wickUpColor: '#ef5350',
      wickDownColor: '#26a69a',
    });

    // 创建成交量系列
    volumeSeries.current = chartInstance.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // 创建MA系列
    const maColors = {
      ma5: '#2196f3',
      ma10: '#ff9800',
      ma20: '#9c27b0',
      ma60: '#f44336'
    };

    Object.keys(maColors).forEach(ma => {
      maSeries.current[ma] = chartInstance.addLineSeries({
        color: maColors[ma],
        lineWidth: 1,
        title: ma.toUpperCase(),
      });
    });

    // 十字准星移动事件
    chartInstance.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.point) {
        setHoverData(null);
        return;
      }

      const data = param.seriesData.get(candlestickSeries.current);
      if (data) {
        setHoverData({
          time: param.time,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        });
      }
    });

    // 窗口大小调整
    const handleResize = () => {
      if (chartContainerRef.current && chart.current) {
        chart.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chart.current) {
        chart.current.remove();
        chart.current = null;
      }
    };
  }, [height]);

  // 加载K线数据
  const loadKlineData = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    try {
      // 获取K线数据
      const response = await axios.get(
        `/api/v1/stocks/${symbol}/kline?period=${period}&limit=500`
      );

      const data = response.data.klines || [];
      setKlineData(data);

      // 转换数据格式
      const candleData = data.map(k => ({
        time: k.date,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      const volumeData = data.map(k => ({
        time: k.date,
        value: k.volume,
        color: k.close >= k.open ? '#ef5350' : '#26a69a',
      }));

      // 设置数据
      candlestickSeries.current.setData(candleData);
      volumeSeries.current.setData(volumeData);

      // 计算并设置MA数据
      updateMAIndicators(data);

      // 获取股票信息
      const infoResponse = await axios.get(`/api/v1/stocks/${symbol}/quote`);
      setStockInfo(infoResponse.data);

      // 适应视图
      chart.current.timeScale().fitContent();

    } catch (error) {
      console.error('加载K线数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  // 更新MA指标
  const updateMAIndicators = (data) => {
    if (!data || data.length === 0) return;

    const periods = {
      ma5: 5,
      ma10: 10,
      ma20: 20,
      ma60: 60
    };

    Object.entries(periods).forEach(([key, period]) => {
      if (indicators[key] && maSeries.current[key]) {
        const maData = calculateMA(data, period);
        maSeries.current[key].setData(maData);
        maSeries.current[key].applyOptions({ visible: true });
      } else if (maSeries.current[key]) {
        maSeries.current[key].applyOptions({ visible: false });
      }
    });
  };

  // 计算MA
  const calculateMA = (data, period) => {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      result.push({
        time: data[i].date,
        value: sum / period,
      });
    }
    return result;
  };

  // 加载数据
  useEffect(() => {
    loadKlineData();
  }, [loadKlineData]);

  // 更新指标显示
  useEffect(() => {
    if (klineData.length > 0) {
      updateMAIndicators(klineData);
    }
  }, [indicators, klineData]);

  // 切换指标
  const toggleIndicator = (key) => {
    setIndicators(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 十字准星数据显示
  const CrosshairInfo = () => {
    if (!hoverData) return null;

    return (
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'var(--bg-secondary)',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        zIndex: 10,
        fontSize: '12px',
        minWidth: '150px'
      }}>
        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>
          {hoverData.time}
        </div>
        <Row gutter={[8, 4]}>
          <Col span={12}>开盘:</Col>
          <Col span={12} style={{ textAlign: 'right' }}>{hoverData.open?.toFixed(2)}</Col>
          <Col span={12}>最高:</Col>
          <Col span={12} style={{ textAlign: 'right', color: '#ef5350' }}>{hoverData.high?.toFixed(2)}</Col>
          <Col span={12}>最低:</Col>
          <Col span={12} style={{ textAlign: 'right', color: '#26a69a' }}>{hoverData.low?.toFixed(2)}</Col>
          <Col span={12}>收盘:</Col>
          <Col span={12} style={{ textAlign: 'right', fontWeight: 'bold' }}>{hoverData.close?.toFixed(2)}</Col>
        </Row>
      </div>
    );
  };

  return (
    <div>
      {/* 顶部工具栏 */}
      <LuxuryCard style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <Space size="large">
              {/* 股票信息 */}
              {stockInfo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                      {stockInfo.name} ({symbol})
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: stockInfo.change_percent >= 0 ? '#ef5350' : '#26a69a' }}>
                      ¥{stockInfo.price?.toFixed(2)}
                      <span style={{ fontSize: '14px', marginLeft: 8 }}>
                        <ChangeDisplay value={stockInfo.change_percent} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Space>
          </Col>

          <Col xs={24} md={12} style={{ textAlign: 'right' }}>
            <Space>
              {/* 周期选择 */}
              <Select
                value={period}
                onChange={setPeriod}
                style={{ width: 100 }}
                size="small"
              >
                <Option value="daily">日K</Option>
                <Option value="weekly">周K</Option>
                <Option value="monthly">月K</Option>
              </Select>

              {/* 刷新按钮 */}
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={loadKlineData}
                loading={loading}
              />

              {/* 指标设置 */}
              <Button
                icon={<SettingOutlined />}
                size="small"
              />
            </Space>
          </Col>
        </Row>

        {/* 指标开关 */}
        <Divider style={{ margin: '16px 0' }} />
        
        <Row gutter={[16, 8]}>
          <Col span={24}>
            <Space wrap>
              <span style={{ color: 'var(--text-muted)' }}>指标:</span>
              
              <Badge dot color="#2196f3">
                <Button
                  size="small"
                  type={indicators.ma5 ? 'primary' : 'default'}
                  onClick={() => toggleIndicator('ma5')}
                >
                  MA5
                </Button>
              </Badge>

              <Badge dot color="#ff9800">
                <Button
                  size="small"
                  type={indicators.ma10 ? 'primary' : 'default'}
                  onClick={() => toggleIndicator('ma10')}
                >
                  MA10
                </Button>
              </Badge>

              <Badge dot color="#9c27b0">
                <Button
                  size="small"
                  type={indicators.ma20 ? 'primary' : 'default'}
                  onClick={() => toggleIndicator('ma20')}
                >
                  MA20
                </Button>
              </Badge>

              <Badge dot color="#f44336">
                <Button
                  size="small"
                  type={indicators.ma60 ? 'primary' : 'default'}
                  onClick={() => toggleIndicator('ma60')}
                >
                  MA60
                </Button>
              </Badge>

              <Divider type="vertical" />

              <Button
                size="small"
                icon={<BarChartOutlined />}
                type={indicators.volume ? 'primary' : 'default'}
                onClick={() => toggleIndicator('volume')}
              >
                成交量
              </Button>

              <Button
                size="small"
                type={indicators.macd ? 'primary' : 'default'}
                onClick={() => toggleIndicator('macd')}
              >
                MACD
              </Button>

              <Button
                size="small"
                type={indicators.rsi ? 'primary' : 'default'}
                onClick={() => toggleIndicator('rsi')}
              >
                RSI
              </Button>

              <Button
                size="small"
                type={indicators.boll ? 'primary' : 'default'}
                onClick={() => toggleIndicator('boll')}
              >
                BOLL
              </Button>
            </Space>
          </Col>
        </Row>
      </LuxuryCard>

      {/* 图表区域 */}
      <LuxuryCard style={{ position: 'relative' }}>
        <CrosshairInfo />
        
        <div
          ref={chartContainerRef}
          style={{
            width: '100%',
            height: height,
          }}
        />

        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}>
            <LoadingState text="加载K线数据..." />
          </div>
        )}
      </LuxuryCard>

      {/* 技术指标面板 */}
      {indicators.macd && (
        <LuxuryCard style={{ marginTop: 16 }}>
          <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            MACD 指标面板 (开发中)
          </div>
        </LuxuryCard>
      )}

      {indicators.rsi && (
        <LuxuryCard style={{ marginTop: 16 }}>
          <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            RSI 指标面板 (开发中)
          </div>
        </LuxuryCard>
      )}
    </div>
  );
};

export default StockChartPro;
