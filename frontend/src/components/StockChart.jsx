import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Select, Radio, Spin, Empty, Button, Space, Tooltip } from 'antd';
import { StockOutlined, ReloadOutlined, FullscreenOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import { SciFiCard } from './Common';

/**
 * 股票K线图表组件
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称
 * @param {string} className - CSS类名
 * @param {object} style - 样式对象
 */
const StockChart = ({ symbol, name, className = '', style = {} }) => {
  const [period, setPeriod] = useState('day'); // day, week, month
  const [indicator, setIndicator] = useState(['ma', 'volume']); // 指标显示
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);
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
      } else {
        setError('暂无数据');
      }
    } catch (err) {
      console.error('获取K线数据失败:', err);
      setError('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

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
        sum += data[i - j][1]; // 收盘价
      }
      result.push((sum / period).toFixed(2));
    }
    return result;
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

    // 计算MA
    const ma5 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 5);
    const ma10 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 10);
    const ma20 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 20);
    const ma60 = calculateMA(chartData.klines.map(item => [item.date, item.close]), 60);

    return { dates, klines, volumes, ma5, ma10, ma20, ma60 };
  }, [chartData]);

  // ECharts配置
  const getChartOption = useMemo(() => {
    if (!formatKlineData) return {};

    const { dates, klines, volumes, ma5, ma10, ma20, ma60 } = formatKlineData;
    const showVolume = indicator.includes('volume');
    const showMA = indicator.includes('ma');

    const upColor = '#3fb950';
    const downColor = '#f85149';

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 500,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
        textStyle: { color: 'var(--text-primary)' },
        formatter: function (params) {
          let tooltip = `<div style="font-weight:bold;margin-bottom:5px">${params[0].axisValue}</div>`;
          params.forEach(param => {
            if (param.seriesName === 'K线') {
              const data = param.data;
              tooltip += `
                <div style="margin:3px 0">
                  <span style="display:inline-block;width:10px;height:10px;background:${param.color};margin-right:5px;border-radius:50%"></span>
                  <span>开盘: ${data[1]}</span> | 
                  <span>收盘: ${data[2]}</span> | 
                  <span>最低: ${data[3]}</span> | 
                  <span>最高: ${data[4]}</span>
                </div>
              `;
            } else if (param.seriesName === '成交量') {
              tooltip += `
                <div style="margin:3px 0">
                  <span style="display:inline-block;width:10px;height:10px;background:${param.color};margin-right:5px;border-radius:50%"></span>
                  <span>成交量: ${(param.value / 10000).toFixed(2)}万</span>
                </div>
              `;
            } else {
              tooltip += `
                <div style="margin:3px 0">
                  <span style="color:${param.color};margin-right:5px">●</span>
                  <span>${param.seriesName}: ${param.value}</span>
                </div>
              `;
            }
          });
          return tooltip;
        }
      },
      legend: {
        data: ['K线', 'MA5', 'MA10', 'MA20', 'MA60', '成交量'],
        textStyle: { color: 'var(--text-secondary)' },
        top: 0
      },
      grid: [
        { left: '3%', right: '3%', top: '40px', height: '55%' },
        { left: '3%', right: '3%', top: '68%', height: '20%' }
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          scale: true,
          boundaryGap: false,
          axisLine: { lineStyle: { color: 'var(--border-color)' } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
          splitLine: { show: false }
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          scale: true,
          boundaryGap: false,
          axisLine: { show: false },
          axisLabel: { show: false },
          splitLine: { show: false }
        }
      ],
      yAxis: [
        {
          scale: true,
          splitArea: { show: false },
          splitLine: { lineStyle: { color: 'var(--border-color)', opacity: 0.3 } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 10 }
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 50,
          end: 100
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          top: '92%',
          height: '20px',
          start: 50,
          end: 100,
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          fillerColor: 'rgba(88, 166, 255, 0.2)',
          handleStyle: { color: 'var(--primary-color)' },
          textStyle: { color: 'var(--text-secondary)' }
        }
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: klines.map((item, index) => {
            const isUp = item[1] >= item[0];
            return {
              value: [item[0], item[1], item[2], item[3]],
              itemStyle: {
                color: isUp ? upColor : downColor,
                color0: isUp ? upColor : downColor,
                borderColor: isUp ? upColor : downColor,
                borderColor0: isUp ? upColor : downColor
              }
            };
          }),
          itemStyle: {
            color: upColor,
            color0: downColor,
            borderColor: upColor,
            borderColor0: downColor
          }
        },
        ...(showMA ? [
          { name: 'MA5', type: 'line', data: ma5, smooth: true, lineStyle: { color: '#58a6ff', width: 1 }, symbol: 'none' },
          { name: 'MA10', type: 'line', data: ma10, smooth: true, lineStyle: { color: '#a371f7', width: 1 }, symbol: 'none' },
          { name: 'MA20', type: 'line', data: ma20, smooth: true, lineStyle: { color: '#d29922', width: 1 }, symbol: 'none' },
          { name: 'MA60', type: 'line', data: ma60, smooth: true, lineStyle: { color: '#6e7681', width: 1 }, symbol: 'none' }
        ] : []),
        ...(showVolume ? [
          {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: volumes.map((vol, index) => {
              const isUp = klines[index][1] >= klines[index][0];
              return {
                value: vol,
                itemStyle: {
                  color: isUp ? upColor : downColor
                }
              };
            })
          }
        ] : [])
      ]
    };
  }, [formatKlineData, indicator]);

  // 处理全屏
  const handleFullscreen = () => {
    if (chartRef.current) {
      const element = chartRef.current.getEchartsInstance().getDom();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        element.requestFullscreen();
      }
    }
  };

  // 周期选项
  const periodOptions = [
    { label: '日K', value: 'day' },
    { label: '周K', value: 'week' },
    { label: '月K', value: 'month' }
  ];

  return (
    <SciFiCard 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StockOutlined />
          <span>K线图表</span>
          {symbol && (
            <span style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)',
              marginLeft: '8px'
            }}>
              {symbol} {name && `(${name})`}
            </span>
          )}
        </div>
      }
      className={className}
      style={style}
    >
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
          style={{ width: 180 }}
          placeholder="选择指标"
          options={[
            { label: 'MA均线', value: 'ma' },
            { label: '成交量', value: 'volume' }
          ]}
        />

        {/* 操作按钮 */}
        <Space>
          <Tooltip title="刷新">
            <Button 
              icon={<ReloadOutlined />} 
              size="small"
              onClick={fetchKlineData}
              loading={loading}
            />
          </Tooltip>
          <Tooltip title="全屏">
            <Button 
              icon={<FullscreenOutlined />} 
              size="small"
              onClick={handleFullscreen}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 图表区域 */}
      <div style={{ height: '400px', position: 'relative' }}>
        {loading ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            height: '100%'
          }}>
            <Spin size="large" />
          </div>
        ) : error ? (
          <Empty 
            description={error}
            style={{ marginTop: '100px' }}
          />
        ) : formatKlineData ? (
          <ReactECharts
            ref={chartRef}
            option={getChartOption}
            style={{ height: '100%', width: '100%' }}
            theme="dark"
          />
        ) : (
          <Empty 
            description="选择股票查看K线图"
            style={{ marginTop: '100px' }}
          />
        )}
      </div>
    </SciFiCard>
  );
};

export default StockChart;