import React, { useState, useEffect } from 'react';
import { Row, Col } from 'antd';
import { RiseOutlined, FallOutlined, StockOutlined, BarChartOutlined } from '@ant-design/icons';
import { MetricCard, LuxuryCard, LoadingState } from './Common';
import axios from 'axios';

const LegendItem = ({ color, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span className="status-dot" style={{ color }} aria-hidden="true" />
    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    <span className="num" style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
      {value}
    </span>
  </div>
);

/**
 * 市场概览仪表盘
 */
const MarketOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchOverview = async () => {
    try {
      const response = await axios.get('/api/v1/market/overview');
      setData(response.data);
    } catch (error) {
      console.error('获取市场概览失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState text="加载市场数据..." />;
  if (!data) return <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>暂无数据</div>;

  const upRatio = data.total_stocks > 0 
    ? (data.up_count / data.total_stocks * 100).toFixed(1) 
    : 0;
  const downRatio = data.total_stocks > 0 
    ? (data.down_count / data.total_stocks * 100).toFixed(1) 
    : 0;
  const flatRatio = data.total_stocks > 0
    ? (data.flat_count / data.total_stocks * 100).toFixed(1)
    : 0;

  const segmentLabel = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    color: 'var(--text-primary)',
    fontWeight: '500',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    transition: 'width 180ms ease',
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <MetricCard 
            title="上涨家数"
            value={data.up_count.toLocaleString()}
            change={`+${upRatio}%`}
            trend="up"
            icon={<RiseOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <MetricCard 
            title="下跌家数"
            value={data.down_count.toLocaleString()}
            change={`-${downRatio}%`}
            trend="down"
            icon={<FallOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <MetricCard 
            title="平均涨跌"
            value={`${data.avg_change >= 0 ? '+' : ''}${data.avg_change.toFixed(2)}`}
            trend={data.avg_change >= 0 ? 'up' : 'down'}
            suffix="%"
            icon={<BarChartOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <MetricCard 
            title="总成交额"
            value={(data.volume / 100000000).toFixed(1)}
            suffix="亿"
            icon={<StockOutlined />}
          />
        </Col>
      </Row>

      {/* 涨跌分布：细条 + 图例（A 股：红涨绿跌） */}
      <Row style={{ marginTop: '16px', marginBottom: '16px' }}>
        <Col span={24}>
          <LuxuryCard 
            title="涨跌分布" 
            subtitle={`全市场共 ${data.total_stocks.toLocaleString()} 只股票`}
          >
            <div
              role="img"
              aria-label={`上涨 ${upRatio}%，平盘 ${flatRatio}%，下跌 ${downRatio}%`}
              style={{ 
                display: 'flex', 
                height: '24px',
                gap: '2px',
                borderRadius: '6px',
                overflow: 'hidden',
                background: 'var(--bg-tertiary)'
              }}
            >
              <div style={{
                ...segmentLabel,
                width: `${upRatio}%`,
                background: 'var(--up-bg)',
                borderBottom: '2px solid var(--up-color)'
              }}>
                {upRatio > 8 && <>
                  <RiseOutlined aria-hidden="true" style={{ color: 'var(--up-color)' }} /> 
                  {upRatio}%
                </>}
              </div>
              
              <div style={{
                width: `${flatRatio}%`,
                background: 'var(--bg-elevated)',
                borderBottom: '2px solid var(--flat-color)',
                minWidth: flatRatio > 1 ? '4px' : '0'
              }} />
              
              <div style={{
                ...segmentLabel,
                width: `${downRatio}%`,
                background: 'var(--down-bg)',
                borderBottom: '2px solid var(--down-color)'
              }}>
                {downRatio > 8 && <>
                  <FallOutlined aria-hidden="true" style={{ color: 'var(--down-color)' }} /> 
                  {downRatio}%
                </>}
              </div>
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '16px',
              fontSize: '13px'
            }}>
              <LegendItem color="var(--up-color)" label="上涨" value={data.up_count.toLocaleString()} />
              <LegendItem color="var(--flat-color)" label="平盘" value={data.flat_count.toLocaleString()} />
              <LegendItem color="var(--down-color)" label="下跌" value={data.down_count.toLocaleString()} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>总计</span>
                <span className="num" style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                  {data.total_stocks.toLocaleString()}
                </span>
              </div>
            </div>
          </LuxuryCard>
        </Col>
      </Row>
    </div>
  );
};

export default MarketOverview;
