import React, { useState } from 'react';
import { 
  Card, Row, Col, Statistic, Table, Tabs, Tooltip, Tag,
  Button, Space, Progress, Alert, Divider
} from 'antd';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Area, ComposedChart, Bar, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, DollarSign, 
  BarChart2, PieChart, Clock, AlertTriangle
} from 'lucide-react';
import { LuxuryCard, ChangeDisplay } from './Common';

const { TabPane } = Tabs;

/**
 * 回测结果展示组件
 * 专业级回测报告展示
 */
const BacktestReport = ({ result }) => {
  if (!result || result.trade_count === 0) {
    return (
      <Alert
        message="暂无回测数据"
        description="该股票暂无可用的回测结果，请检查数据是否充足。"
        type="info"
        showIcon
      />
    );
  }

  const {
    total_return, annual_return, max_drawdown, max_drawdown_duration,
    sharpe_ratio, sortino_ratio, calmar_ratio, annual_volatility,
    trade_count, win_rate, profit_loss_ratio, avg_trade_return,
    avg_profit, avg_loss, max_consecutive_wins, max_consecutive_losses,
    avg_trade_duration, avg_win_duration, avg_loss_duration,
    var_95, cvar_95, alpha, beta, skewness, kurtosis,
    equity_curve, monthly_returns, trades, position_history
  } = result;

  // 收益曲线数据
  const equityData = equity_curve?.map(p => ({
    date: typeof p.date === 'string' ? p.date.slice(0, 10) : p.date,
    equity: p.equity,
    price: p.price
  })) || [];

  // 回撤计算
  const drawdownData = React.useMemo(() => {
    if (!equity_curve || equity_curve.length === 0) return [];
    
    let peak = equity_curve[0].equity;
    return equity_curve.map(p => {
      if (p.equity > peak) peak = p.equity;
      const dd = (peak - p.equity) / peak * 100;
      return {
        date: typeof p.date === 'string' ? p.date.slice(0, 10) : p.date,
        drawdown: dd
      };
    });
  }, [equity_curve]);

  // 月度收益热力图数据
  const monthlyData = React.useMemo(() => {
    if (!monthly_returns) return [];
    
    const data = [];
    Object.entries(monthly_returns).forEach(([month, ret]) => {
      const [year, mon] = month.split('-');
      data.push({
        year: parseInt(year),
        month: parseInt(mon),
        return: ret
      });
    });
    return data;
  }, [monthly_returns]);

  // 获取颜色
  const getReturnColor = (value) => value >= 0 ? '#52c41a' : '#ff4d4f';
  const getMetricColor = (value, threshold) => value >= threshold ? '#52c41a' : value >= threshold/2 ? '#faad14' : '#ff4d4f';

  // 交易记录列定义
  const tradeColumns = [
    {
      title: '买入日期',
      dataIndex: 'entry_date',
      key: 'entry_date',
      render: (text) => text?.slice(0, 10) || '-'
    },
    {
      title: '买入价格',
      dataIndex: 'entry_price',
      key: 'entry_price',
      align: 'right',
      render: (v) => `¥${v?.toFixed(2)}`
    },
    {
      title: '卖出日期',
      dataIndex: 'exit_date',
      key: 'exit_date',
      render: (text) => text?.slice(0, 10) || '-'
    },
    {
      title: '卖出价格',
      dataIndex: 'exit_price',
      key: 'exit_price',
      align: 'right',
      render: (v) => `¥${v?.toFixed(2)}`
    },
    {
      title: '收益率',
      dataIndex: 'return_pct',
      key: 'return_pct',
      align: 'right',
      render: (v) => (
        <span style={{ color: getReturnColor(v), fontWeight: 600 }}>
          {v > 0 ? '+' : ''}{v?.toFixed(2)}%
        </span>
      )
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      align: 'right',
      render: (v) => (
        <span style={{ color: getReturnColor(v) }}>
          {v > 0 ? '+' : ''}¥{v?.toFixed(0)}
        </span>
      )
    }
  ];

  return (
    <div className="backtest-report">
      {/* 核心指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <LuxuryCard>
            <Statistic
              title="总收益率"
              value={total_return}
              precision={2}
              suffix="%"
              valueStyle={{ 
                color: getReturnColor(total_return),
                fontSize: '28px',
                fontWeight: 'bold'
              }}
              prefix={total_return >= 0 ? <TrendingUp size={24}/> : <TrendingDown size={24}/>}
            />
          </LuxuryCard>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <LuxuryCard>
            <Statistic
              title="年化收益率"
              value={annual_return}
              precision={2}
              suffix="%"
              valueStyle={{ color: getReturnColor(annual_return), fontSize: '24px' }}
            />
          </LuxuryCard>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <LuxuryCard>
            <Statistic
              title="最大回撤"
              value={max_drawdown}
              precision={2}
              suffix="%"
              valueStyle={{ color: '#ff4d4f', fontSize: '24px' }}
              prefix={<AlertTriangle size={20}/>}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 8 }}>
              持续 {max_drawdown_duration} 天
            </div>
          </LuxuryCard>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <LuxuryCard>
            <Statistic
              title="夏普比率"
              value={sharpe_ratio}
              precision={2}
              valueStyle={{ 
                color: getMetricColor(sharpe_ratio, 1.0),
                fontSize: '24px'
              }}
              prefix={<Activity size={20}/>}
            />
          </LuxuryCard>
        </Col>
      </Row>

      {/* 详细指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <LuxuryCard title="风险指标">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">年化波动率</div>
                  <div className="metric-value" style={{ color: getMetricColor(annual_volatility, 20) }}>
                    {annual_volatility?.toFixed(2)}%
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">VaR (95%)</div>
                  <div className="metric-value" style={{ color: '#ff4d4f' }}>
                    {var_95?.toFixed(2)}%
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">索提诺比率</div>
                  <div className="metric-value" style={{ color: getMetricColor(sortino_ratio, 1.0) }}>
                    {sortino_ratio?.toFixed(2)}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">卡玛比率</div>
                  <div className="metric-value" style={{ color: getMetricColor(calmar_ratio, 1.0) }}>
                    {calmar_ratio?.toFixed(2)}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">Beta</div>
                  <div className="metric-value">{beta?.toFixed(2)}</div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">Alpha</div>
                  <div className="metric-value" style={{ color: getReturnColor(alpha) }}>
                    {alpha > 0 ? '+' : ''}{alpha?.toFixed(2)}%
                  </div>
                </div>
              </Col>
            </Row>
          </LuxuryCard>
        </Col>

        <Col xs={24} md={12}>
          <LuxuryCard title="交易统计">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">总交易次数</div>
                  <div className="metric-value">{trade_count}</div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">胜率</div>
                  <div className="metric-value" style={{ color: getMetricColor(win_rate, 50) }}>
                    {win_rate?.toFixed(1)}%
                  </div>
                  <Progress 
                    percent={win_rate} 
                    size="small" 
                    strokeColor={win_rate >= 50 ? '#52c41a' : '#ff4d4f'}
                    showInfo={false}
                  />
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">盈亏比</div>
                  <div className="metric-value" style={{ color: getMetricColor(profit_loss_ratio, 1.5) }}>
                    {profit_loss_ratio?.toFixed(2)}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">平均收益</div>
                  <div className="metric-value" style={{ color: getReturnColor(avg_trade_return) }}>
                    {avg_trade_return > 0 ? '+' : ''}{avg_trade_return?.toFixed(2)}%
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">平均盈利</div>
                  <div className="metric-value" style={{ color: '#52c41a' }}>
                    +{avg_profit?.toFixed(2)}%
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">平均亏损</div>
                  <div className="metric-value" style={{ color: '#ff4d4f' }}>
                    {avg_loss?.toFixed(2)}%
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">最大连盈</div>
                  <div className="metric-value" style={{ color: '#52c41a' }}>
                    {max_consecutive_wins} 次
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="metric-item">
                  <div className="metric-label">最大连亏</div>
                  <div className="metric-value" style={{ color: '#ff4d4f' }}>
                    {max_consecutive_losses} 次
                  </div>
                </div>
              </Col>
            </Row>
          </LuxuryCard>
        </Col>
      </Row>

      {/* 持仓分析 */}
      <LuxuryCard title="持仓分析" style={{ marginBottom: 24 }}>
        <Row gutter={[32, 16]}>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8 }}>
                <Clock size={14} style={{ marginRight: 4 }}/>平均持仓时间
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {avg_trade_duration?.toFixed(1)} 天
              </div>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#52c41a', marginBottom: 8 }}>
                盈利持仓平均
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                {avg_win_duration?.toFixed(1)} 天
              </div>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#ff4d4f', marginBottom: 8 }}>
                亏损持仓平均
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff4d4f' }}>
                {avg_loss_duration?.toFixed(1)} 天
              </div>
            </div>
          </Col>
        </Row>
      </LuxuryCard>

      {/* 图表区域 */}
      <Tabs defaultActiveKey="equity" style={{ marginBottom: 24 }}>
        <TabPane tab="收益曲线" key="equity">
          <LuxuryCard>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  yAxisId="left"
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 12 }}
                  domain={['auto', 'auto']}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="#52c41a"
                  tick={{ fontSize: 12 }}
                />
                
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px'
                  }}
                />
                
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="equity"
                  stroke="#1890ff"
                  fill="url(#colorEquity)"
                  fillOpacity={0.3}
                  name="权益"
                />
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#1890ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
              </ComposedChart>
            </ResponsiveContainer>
          </LuxuryCard>
        </TabPane>

        <TabPane tab="回撤曲线" key="drawdown">
          <LuxuryCard>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={drawdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 12 }}
                  domain={[0, 'auto']}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                
                <RechartsTooltip 
                  formatter={(v) => [`${v.toFixed(2)}%`, '回撤']}
                  contentStyle={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px'
                  }}
                />
                
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ff4d4f"
                  fill="#ff4d4f"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </LuxuryCard>
        </TabPane>

        <TabPane tab="月度收益" key="monthly">
          <LuxuryCard>
            {monthlyData.length > 0 ? (
              <div className="monthly-heatmap">
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap: '4px',
                  marginBottom: '16px'
                }}>
                  {['1月', '2月', '3月', '4月', '5月', '6月', 
                    '7月', '8月', '9月', '10月', '11月', '12月'].map(m => (
                    <div key={m} style={{ textAlign: 'center', fontSize: '12px' }}>{m}</div>
                  ))}
                
003c/div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {Array.from(new Set(monthlyData.map(d => d.year))).sort().map(year => (
                    <div key={year} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <div style={{ width: '50px', fontSize: '12px' }}>{year}</div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(12, 1fr)',
                        gap: '4px',
                        flex: 1
                      }}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                          const data = monthlyData.find(d => d.year === year && d.month === month);
                          const ret = data?.return || 0;
                          const color = ret > 0 
                            ? `rgba(82, 196, 26, ${Math.min(Math.abs(ret) / 10, 1)})`
                            : `rgba(255, 77, 79, ${Math.min(Math.abs(ret) / 10, 1)})`;
                          
                          return (
                            <Tooltip key={month} title={`${year}-${month}: ${ret?.toFixed(2)}%`}>
                              <div
                                style={{
                                  height: '32px',
                                  backgroundColor: data ? color : 'var(--bg-tertiary)',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10px',
                                  color: Math.abs(ret) > 5 ? '#fff' : 'var(--text-primary)',
                                  cursor: 'pointer'
                                }}
                              >
                                {data ? `${ret > 0 ? '+' : ''}${ret.toFixed(0)}` : ''}
                              </div>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Alert message="暂无月度收益数据" type="info" />
            )}
          </LuxuryCard>
        </TabPane>

        <TabPane tab="交易记录" key="trades">
          <LuxuryCard>
            <Table
              columns={tradeColumns}
              dataSource={trades?.map((t, i) => ({ ...t, key: i }))}
              pagination={{ pageSize: 10 }}
              size="small"
              scroll={{ x: 'max-content' }}
            />
          </LuxuryCard>
        </TabPane>
      </Tabs>

      <style jsx>{`
        .metric-item {
          margin-bottom: 16px;
        }
        .metric-label {
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .metric-value {
          font-size: 18px;
          font-weight: 600;
        }
      `}<</style>
    </div>
  );
};

export default BacktestReport;
