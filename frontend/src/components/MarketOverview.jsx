import React, { useState, useEffect } from 'react';
import { Row, Col } from 'antd';
import { RiseOutlined, FallOutlined, StockOutlined, BarChartOutlined } from '@ant-design/icons';
import { MetricCard, LuxuryCard, LoadingState } from './Common';
import axios from 'axios';

/**
 * 市场概览仪表盘 - 奢华黑金风格
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
  if (!data) return <div style={{ color: 'var(--text-muted)' }}>暂无数据</div>;

  const upRatio = data.total_stocks > 0 
    ? (data.up_count / data.total_stocks * 100).toFixed(1) 
    : 0;
  const downRatio = data.total_stocks > 0 
    ? (data.down_count / data.total_stocks * 100).toFixed(1) 
    : 0;
  const flatRatio = data.total_stocks > 0
    ? (data.flat_count / data.total_stocks * 100).toFixed(1)
    : 0;

  return (
    <div>
      <Row gutter={[20, 20]}>
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

      {/* 涨跌分布可视化 - 奢华进度条 */}
      <Row style={{ marginTop: '24px' }}>
        <Col span={24}>
          <LuxuryCard 
            title="涨跌分布" 
            subtitle={`全市场共 ${data.total_stocks.toLocaleString()} 只股票`}
          >
            <div style={{ 
              display: 'flex', 
              height: '44px',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              position: 'relative'
            }}>
              <div style={{
                width: `${upRatio}%`,
                background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px',
                fontFamily: 'var(--font-mono)',
                minWidth: upRatio > 8 ? 'auto' : '0',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)',
                transition: 'width 0.5s ease'
              }}>
                {upRatio > 8 && <>
                  <RiseOutlined style={{ marginRight: '6px' }} /> 
                  {upRatio}%
                </>}
              </div>
              
              <div style={{
                width: `${flatRatio}%`,
                background: 'var(--text-muted)',
                minWidth: flatRatio > 1 ? '4px' : '0'
              }} />
              
              <div style={{
                width: `${downRatio}%`,
                background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px',
                fontFamily: 'var(--font-mono)',
                minWidth: downRatio > 8 ? 'auto' : '0',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)',
                transition: 'width 0.5s ease'
              }}>
                {downRatio > 8 && <>
                  <FallOutlined style={{ marginRight: '6px' }} /> 
                  {downRatio}%
                </>}
              </div>
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginTop: '16px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%',
                  background: 'var(--success-color)',
                  boxShadow: '0 0 8px var(--success-glow)'
                }} />
                <span style={{ color: 'var(--text-secondary)' }}>上涨</span>
                <span style={{ 
                  color: 'var(--success-color)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: '600'
                }}>
                  {data.up_count.toLocaleString()}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%',
                  background: 'var(--text-muted)'
                }} />
                <span style={{ color: 'var(--text-secondary)' }}>平盘</span>
                <span style={{ 
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: '600'
                }}>
                  {data.flat_count.toLocaleString()}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%',
                  background: 'var(--danger-color)',
                  boxShadow: '0 0 8px var(--danger-glow)'
                }} />
                <span style={{ color: 'var(--text-secondary)' }}>下跌</span>
                <span style={{ 
                  color: 'var(--danger-color)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: '600'
                }}>
                  {data.down_count.toLocaleString()}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>总计</span>
                <span style={{ 
                  color: 'var(--gold-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: '600'
                }}>
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
