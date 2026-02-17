import React, { useState, useEffect } from 'react';
import { Row, Col } from 'antd';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { SciFiCard, DataItem, LoadingState } from './Common';
import axios from 'axios';

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
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <SciFiCard>
            <DataItem 
              label="上涨家数"
              value={data.up_count}
              change={`+${upRatio}%`}
              trend="up"
            />
          </SciFiCard>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SciFiCard>
            <DataItem 
              label="下跌家数"
              value={data.down_count}
              change={`-${downRatio}%`}
              trend="down"
            />
          </SciFiCard>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SciFiCard>
            <DataItem 
              label="平均涨跌"
              value={`${data.avg_change >= 0 ? '+' : ''}${data.avg_change.toFixed(2)}`}
              unit="%"
            />
          </SciFiCard>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <SciFiCard>
            <DataItem 
              label="总成交额"
              value={(data.volume / 100000000).toFixed(1)}
              unit="亿"
            />
          </SciFiCard>
        </Col>
      </Row>

      {/* 涨跌分布可视化 */}
      <Row style={{ marginTop: '24px' }}>
        <Col span={24}>
          <SciFiCard title="涨跌分布">
            <div style={{ 
              display: 'flex', 
              height: '40px',
              borderRadius: '6px',
              overflow: 'hidden',
              background: 'var(--bg-tertiary)'
            }}>
              <div style={{
                width: `${upRatio}%`,
                background: 'var(--success-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--bg-primary)',
                fontWeight: 'bold',
                fontSize: '14px',
                minWidth: upRatio > 5 ? 'auto' : '0'
              }}>
                {upRatio > 5 && <><RiseOutlined style={{ marginRight: '4px' }} /> {upRatio}%</>}
              </div>
              <div style={{
                width: `${flatRatio}%`,
                background: 'var(--text-muted)',
                minWidth: flatRatio > 1 ? '4px' : '0'
              }} />
              <div style={{
                width: `${downRatio}%`,
                background: 'var(--danger-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '14px',
                minWidth: downRatio > 5 ? 'auto' : '0'
              }}>
                {downRatio > 5 && <><FallOutlined style={{ marginRight: '4px' }} /> {downRatio}%</>}
              </div>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginTop: '12px',
              fontSize: '13px',
              color: 'var(--text-secondary)'
            }}>
              <span style={{ color: 'var(--success-color)' }}>上涨: {data.up_count}</span>
              <span>平盘: {data.flat_count}</span>
              <span style={{ color: 'var(--danger-color)' }}>下跌: {data.down_count}</span>
              <span>总计: {data.total_stocks}</span>
            </div>
          </SciFiCard>
        </Col>
      </Row>
    </div>
  );
};

export default MarketOverview;
