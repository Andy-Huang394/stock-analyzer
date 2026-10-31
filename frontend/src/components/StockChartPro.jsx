import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
} from 'lightweight-charts';
import { sma, macd, rsi, bollinger } from '../utils/indicators';
import { Row, Col, Select, Button, Space, Badge, Divider } from 'antd';
import { SettingOutlined, BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { LuxuryCard, LoadingState, ChangeDisplay } from './Common';
import { palette, fontSans } from '../styles/palette';

const { Option } = Select;

const SUB_PANE_HEIGHT = 140;
const MA_PERIODS = { ma5: 5, ma10: 10, ma20: 20, ma60: 60 };

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
  const bollSeries = useRef(null);   // { upper, middle, lower }
  const macdSeries = useRef(null);   // { dif, dea, hist }
  const rsiSeries = useRef(null);    // { line }

  const [symbol] = useState(initialSymbol || '600519');
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
        textColor: palette.chartText,
        fontFamily: fontSans,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: palette.chartGrid },
        horzLines: { color: palette.chartGrid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.25)',
          labelBackgroundColor: palette.surface3,
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.25)',
          labelBackgroundColor: palette.surface3,
        },
      },
      rightPriceScale: {
        borderColor: palette.chartAxis,
      },
      timeScale: {
        borderColor: palette.chartAxis,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chart.current = chartInstance;

    // 创建K线系列
    // lightweight-charts v5：统一用 addSeries(定义, 选项, paneIndex)
    candlestickSeries.current = chartInstance.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });

    // 创建成交量系列（主图底部 20% 的独立价格轴）
    volumeSeries.current = chartInstance.addSeries(HistogramSeries, {
      color: palette.down,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chartInstance.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // 创建MA系列
    const maColors = {
      ma5: palette.ma5,
      ma10: palette.ma10,
      ma20: palette.ma20,
      ma60: palette.ma60
    };

    Object.keys(maColors).forEach(ma => {
      maSeries.current[ma] = chartInstance.addSeries(LineSeries, {
        color: maColors[ma],
        lineWidth: 1,
        title: ma.toUpperCase(),
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
    });

    // BOLL 叠加在主图
    const bollLine = (color, style, title) => chartInstance.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      lineStyle: style,
      title,
      visible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    bollSeries.current = {
      upper: bollLine(palette.accent, LineStyle.Dashed, 'UP'),
      middle: bollLine(palette.fgSecondary, LineStyle.Solid, 'MID'),
      lower: bollLine(palette.accent, LineStyle.Dashed, 'LOW'),
    };

    // 十字准星移动事件
    chartInstance.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.point) {
        setHoverData(null);
        return;
      }

      const data = param.seriesData.get(candlestickSeries.current);
      if (data) {
        const val = (s) => (s ? param.seriesData.get(s)?.value : undefined);
        setHoverData({
          time: param.time,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          dif: val(macdSeries.current?.dif),
          dea: val(macdSeries.current?.dea),
          macd: val(macdSeries.current?.hist),
          rsi: val(rsiSeries.current?.line),
        });
      }
    });

    // 窗口大小调整（总高度 = 主图 + 副图数 × SUB_PANE_HEIGHT）
    const subPaneCount = () => Math.max(0, (chart.current?.panes().length ?? 1) - 1);
    const handleResize = () => {
      if (chartContainerRef.current && chart.current) {
        chart.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height + subPaneCount() * SUB_PANE_HEIGHT,
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
      macdSeries.current = null;
      rsiSeries.current = null;
      bollSeries.current = null;
      maSeries.current = {};
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
        color: k.close >= k.open ? palette.up : palette.down,
      }));

      // 设置数据（指标由下方 effect 根据 klineData 同步）
      if (!chart.current) return;
      candlestickSeries.current.setData(candleData);
      volumeSeries.current.setData(volumeData);

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

  // 加载数据
  useEffect(() => {
    loadKlineData();
  }, [loadKlineData]);

  // 同步全部指标：MA / 成交量 / BOLL 在主图；MACD、RSI 按需建独立副图 pane
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const data = klineData;

    // 主图叠加
    Object.entries(MA_PERIODS).forEach(([key, n]) => {
      const s = maSeries.current[key];
      if (!s) return;
      if (indicators[key] && data.length) s.setData(sma(data, n));
      s.applyOptions({ visible: !!indicators[key] });
    });
    volumeSeries.current?.applyOptions({ visible: indicators.volume });

    if (bollSeries.current) {
      const b = indicators.boll && data.length ? bollinger(data, 20, 2) : null;
      Object.entries(bollSeries.current).forEach(([k, s]) => {
        if (b) s.setData(b[k]);
        s.applyOptions({ visible: !!b });
      });
    }

    // 副图：先拆掉旧的，再按 MACD → RSI 顺序重建，保证 pane 下标连续
    const dropPane = (ref) => {
      if (!ref.current) return;
      Object.values(ref.current).forEach((s) => c.removeSeries(s));
      ref.current = null;
    };
    dropPane(rsiSeries);
    dropPane(macdSeries);
    // removeSeries 会自动移除空 pane；兜底清理残留
    while (c.panes().length > 1) c.removePane(c.panes().length - 1);

    let pane = 1;
    if (indicators.macd && data.length) {
      const m = macd(data, 12, 26, 9, { up: palette.up, down: palette.down });
      const hist = c.addSeries(HistogramSeries, {
        priceLineVisible: false, lastValueVisible: false, title: 'MACD',
      }, pane);
      const dif = c.addSeries(LineSeries, {
        color: palette.ma5, lineWidth: 1, title: 'DIF',
        priceLineVisible: false, crosshairMarkerVisible: false,
      }, pane);
      const dea = c.addSeries(LineSeries, {
        color: palette.ma10, lineWidth: 1, title: 'DEA',
        priceLineVisible: false, crosshairMarkerVisible: false,
      }, pane);
      hist.setData(m.hist);
      dif.setData(m.dif);
      dea.setData(m.dea);
      macdSeries.current = { hist, dif, dea };
      pane += 1;
    }
    if (indicators.rsi && data.length) {
      const line = c.addSeries(LineSeries, {
        color: palette.ma20, lineWidth: 1, title: 'RSI14',
        priceLineVisible: false, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      }, pane);
      line.setData(rsi(data, 14));
      [70, 30].forEach((price) => line.createPriceLine({
        price, color: palette.lineStrong, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '',
      }));
      rsiSeries.current = { line };
      pane += 1;
    }

    // 副图高度固定，主图保持 height
    const panes = c.panes();
    panes.forEach((p, i) => p.setHeight(i === 0 ? height : SUB_PANE_HEIGHT));
    if (chartContainerRef.current) {
      c.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: height + (panes.length - 1) * SUB_PANE_HEIGHT,
      });
    }
  }, [indicators, klineData, height]);

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
        background: 'var(--bg-tertiary)',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        zIndex: 10,
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        minWidth: '150px'
      }}>
        <div className="num" style={{ marginBottom: '4px', fontWeight: 600 }}>
          {hoverData.time}
        </div>
        <Row gutter={[8, 4]}>
          <Col span={12}>开盘:</Col>
          <Col span={12} style={{ textAlign: 'right' }}>{hoverData.open?.toFixed(2)}</Col>
          <Col span={12}>最高:</Col>
          <Col span={12} style={{ textAlign: 'right', color: palette.up }}>{hoverData.high?.toFixed(2)}</Col>
          <Col span={12}>最低:</Col>
          <Col span={12} style={{ textAlign: 'right', color: palette.down }}>{hoverData.low?.toFixed(2)}</Col>
          <Col span={12}>收盘:</Col>
          <Col span={12} style={{ textAlign: 'right', fontWeight: 'bold' }}>{hoverData.close?.toFixed(2)}</Col>
          {hoverData.dif !== undefined && (
            <>
              <Col span={12}>DIF/DEA:</Col>
              <Col span={12} style={{ textAlign: 'right' }}>
                {hoverData.dif.toFixed(3)} / {hoverData.dea?.toFixed(3)}
              </Col>
              <Col span={12}>MACD:</Col>
              <Col span={12} style={{ textAlign: 'right', color: hoverData.macd >= 0 ? palette.up : palette.down }}>
                {hoverData.macd?.toFixed(3)}
              </Col>
            </>
          )}
          {hoverData.rsi !== undefined && (
            <>
              <Col span={12}>RSI14:</Col>
              <Col span={12} style={{ textAlign: 'right' }}>{hoverData.rsi.toFixed(2)}</Col>
            </>
          )}
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
                    <div style={{ fontSize: '16px', fontWeight: 600 }}>
                      {stockInfo.name} ({symbol})
                    </div>
                    <div className="num" style={{ fontSize: '22px', fontWeight: 600, color: stockInfo.change_percent >= 0 ? palette.up : palette.down }}>
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
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>指标</span>
              
              <Badge dot color={palette.ma5}>
                <Button
                  size="small"
                  className={indicators.ma5 ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.ma5}
                  onClick={() => toggleIndicator('ma5')}
                >
                  MA5
                </Button>
              </Badge>

              <Badge dot color={palette.ma10}>
                <Button
                  size="small"
                  className={indicators.ma10 ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.ma10}
                  onClick={() => toggleIndicator('ma10')}
                >
                  MA10
                </Button>
              </Badge>

              <Badge dot color={palette.ma20}>
                <Button
                  size="small"
                  className={indicators.ma20 ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.ma20}
                  onClick={() => toggleIndicator('ma20')}
                >
                  MA20
                </Button>
              </Badge>

              <Badge dot color={palette.ma60}>
                <Button
                  size="small"
                  className={indicators.ma60 ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.ma60}
                  onClick={() => toggleIndicator('ma60')}
                >
                  MA60
                </Button>
              </Badge>

              <Divider type="vertical" />

              <Button
                size="small"
                icon={<BarChartOutlined />}
                className={indicators.volume ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.volume}
                onClick={() => toggleIndicator('volume')}
              >
                成交量
              </Button>

              <Button
                size="small"
                className={indicators.macd ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.macd}
                onClick={() => toggleIndicator('macd')}
              >
                MACD
              </Button>

              <Button
                size="small"
                className={indicators.rsi ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.rsi}
                onClick={() => toggleIndicator('rsi')}
              >
                RSI
              </Button>

              <Button
                size="small"
                className={indicators.boll ? 'toggle-btn is-active' : 'toggle-btn'}
                  aria-pressed={indicators.boll}
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
            minHeight: height, // 副图启用后由图表自行撑高
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

    </div>
  );
};

export default StockChartPro;
