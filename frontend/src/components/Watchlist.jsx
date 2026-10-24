import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, Button, Space, message, Popconfirm, Tooltip, 
  Badge, Modal, Empty, Input, Form, Row, Col, Statistic
} from 'antd';
import { 
  StarOutlined, StarFilled, DeleteOutlined, EditOutlined,
  LineChartOutlined, BellOutlined, ExportOutlined, ImportOutlined,
  ReloadOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { LuxuryCard, ChangeDisplay, LoadingState } from './Common';

const WATCHLIST_KEY = 'stock_analyzer_watchlist';
const API_BASE = '/api/v1';

/**
 * 自选股管理组件
 * @param {boolean} showInTable - 是否以表格形式显示（用于股票列表页）
 * @param {function} onSelectStock - 选择股票回调
 * @param {string} className - CSS类名
 * @param {object} style - 样式对象
 */
const Watchlist = ({ showInTable = false, onSelectStock, className = '', style = {} }) => {
  const [watchlist, setWatchlist] = useState([]);
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [useBackend, setUseBackend] = useState(true); // 默认使用后端
  const [stats, setStats] = useState({ total: 0, with_alerts: 0 });

  // 从后端加载自选股
  const loadWatchlistFromBackend = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/watchlist`);
      if (response.data && response.data.stocks) {
        const stocks = response.data.stocks.map(item => ({
          symbol: item.symbol,
          name: item.name,
          addedAt: item.added_at,
          alertPriceHigh: item.alert_price_high,
          alertPriceLow: item.alert_price_low,
          notes: item.notes
        }));
        setWatchlist(stocks);
        setStockData(response.data.stocks);
      }
    } catch (error) {
      console.error('从后端加载自选股失败:', error);
      message.warning('后端连接失败，切换到本地存储模式');
      setUseBackend(false);
      loadWatchlistFromLocal();
    }
  }, []);

  // 从localStorage加载自选股
  const loadWatchlistFromLocal = useCallback(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed);
        }
      }
    } catch (error) {
      console.error('从本地加载自选股失败:', error);
    }
  }, []);

  // 保存自选股到localStorage
  const saveWatchlistToLocal = useCallback((list) => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
      setWatchlist(list);
    } catch (error) {
      console.error('保存到本地失败:', error);
      message.error('保存失败');
    }
  }, []);

  // 初始加载
  useEffect(() => {
    if (useBackend) {
      loadWatchlistFromBackend();
      loadStats();
    } else {
      loadWatchlistFromLocal();
    }
  }, [useBackend, loadWatchlistFromBackend, loadWatchlistFromLocal]);

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/watchlist/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 从后端刷新股票数据
  const fetchStockDataFromBackend = useCallback(async () => {
    if (!useBackend) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/watchlist`);
      if (response.data && response.data.stocks) {
        setStockData(response.data.stocks);
      }
    } catch (error) {
      console.error('获取股票数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [useBackend]);

  // 从本地刷新股票数据
  const fetchStockDataFromLocal = useCallback(async () => {
    if (watchlist.length === 0) {
      setStockData([]);
      return;
    }

    setLoading(true);
    try {
      const promises = watchlist.map(async (item) => {
        try {
          const response = await axios.get(`${API_BASE}/stocks/${item.symbol}/quote`);
          return {
            ...response.data,
            symbol: item.symbol,
            name: item.name || response.data.name,
            addedAt: item.addedAt,
            alert_price_high: item.alertPriceHigh,
            alert_price_low: item.alertPriceLow,
            notes: item.notes
          };
        } catch (err) {
          console.error(`获取 ${item.symbol} 数据失败:`, err);
          return null;
        }
      });

      const results = await Promise.all(promises);
      setStockData(results.filter(item => item !== null));
    } catch (error) {
      console.error('获取股票数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [watchlist]);

  // 监听自选股变化，刷新数据
  useEffect(() => {
    if (useBackend) {
      fetchStockDataFromBackend();
    } else {
      fetchStockDataFromLocal();
    }
    
    // 设置定时刷新
    const interval = setInterval(() => {
      if (useBackend) {
        fetchStockDataFromBackend();
      } else {
        fetchStockDataFromLocal();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [useBackend, fetchStockDataFromBackend, fetchStockDataFromLocal]);

  // 添加自选股
  const addToWatchlist = async (symbol, name) => {
    if (useBackend) {
      try {
        const response = await axios.post(`${API_BASE}/watchlist/add?symbol=${symbol}&name=${encodeURIComponent(name || '')}`);
        if (response.data.success) {
          message.success(`已将 ${name || symbol} 添加到自选`);
          loadWatchlistFromBackend();
          loadStats();
          return true;
        }
      } catch (error) {
        if (error.response?.status === 400) {
          message.info('该股票已在自选列表中');
        } else {
          message.error('添加失败');
        }
        return false;
      }
    } else {
      // 本地模式
      if (watchlist.some(item => item.symbol === symbol)) {
        message.info('该股票已在自选列表中');
        return false;
      }

      const newList = [...watchlist, {
        symbol,
        name,
        addedAt: new Date().toISOString()
      }];
      
      saveWatchlistToLocal(newList);
      message.success(`已将 ${name || symbol} 添加到自选`);
      return true;
    }
  };

  // 从自选股移除
  const removeFromWatchlist = async (symbol) => {
    if (useBackend) {
      try {
        await axios.delete(`${API_BASE}/watchlist/${symbol}`);
        message.success('已从自选列表移除');
        loadWatchlistFromBackend();
        loadStats();
      } catch (error) {
        message.error('移除失败');
      }
    } else {
      const newList = watchlist.filter(item => item.symbol !== symbol);
      saveWatchlistToLocal(newList);
      message.success('已从自选列表移除');
    }
  };

  // 检查是否在自选股中
  const isInWatchlist = (symbol) => {
    return watchlist.some(item => item.symbol === symbol);
  };

  // 更新自选股信息
  const updateWatchlistItem = async (values) => {
    if (!selectedStock) return;
    
    if (useBackend) {
      try {
        await axios.put(`${API_BASE}/watchlist/${selectedStock.symbol}`, null, {
          params: {
            alert_price_high: values.alert_price_high || null,
            alert_price_low: values.alert_price_low || null,
            notes: values.notes || null
          }
        });
        message.success('更新成功');
        setEditModalVisible(false);
        loadWatchlistFromBackend();
      } catch (error) {
        message.error('更新失败');
      }
    } else {
      // 本地模式
      const newList = watchlist.map(item => {
        if (item.symbol === selectedStock.symbol) {
          return {
            ...item,
            alertPriceHigh: values.alert_price_high,
            alertPriceLow: values.alert_price_low,
            notes: values.notes
          };
        }
        return item;
      });
      saveWatchlistToLocal(newList);
      message.success('更新成功');
      setEditModalVisible(false);
    }
  };

  // 导出自选股
  const exportWatchlist = () => {
    const dataStr = JSON.stringify(watchlist, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `watchlist_${dayjs().format('YYYYMMDD')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  };

  // 导入自选股
  const importWatchlist = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          if (useBackend) {
            // 后端导入
            const stocks = imported.map(item => ({
              symbol: item.symbol,
              name: item.name
            }));
            const response = await axios.post(`${API_BASE}/watchlist/import`, { stocks });
            message.success(response.data.message);
            loadWatchlistFromBackend();
            loadStats();
          } else {
            // 本地导入
            const merged = [...watchlist];
            imported.forEach(item => {
              if (!merged.some(existing => existing.symbol === item.symbol)) {
                merged.push(item);
              }
            });
            saveWatchlistToLocal(merged);
            message.success(`成功导入 ${imported.length} 只股票`);
          }
        } else {
          message.error('文件格式错误');
        }
      } catch (error) {
        message.error('解析文件失败');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // 清空自选股
  const clearWatchlist = async () => {
    if (useBackend) {
      try {
        await axios.delete(`${API_BASE}/watchlist`);
        message.success('已清空自选列表');
        loadWatchlistFromBackend();
        loadStats();
      } catch (error) {
        message.error('清空失败');
      }
    } else {
      saveWatchlistToLocal([]);
      message.success('已清空自选列表');
    }
  };

  // 显示股票详情
  const showStockDetail = (record) => {
    setSelectedStock(record);
    setDetailModalVisible(true);
  };

  // 显示编辑弹窗
  const showEditModal = (record) => {
    setSelectedStock(record);
    setEditModalVisible(true);
  };

  // 检查价格预警
  const checkPriceAlert = (record) => {
    if (!record.quote) return null;
    
    const price = record.quote.price;
    const high = record.alert_price_high;
    const low = record.alert_price_low;
    
    if (high && price >= high) {
      return { type: 'high', message: `价格高于预警线 ¥${high}` };
    }
    if (low && price <= low) {
      return { type: 'low', message: `价格低于预警线 ¥${low}` };
    }
    return null;
  };

  // 表格列定义
  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 100,
      render: (symbol, record) => {
        const alert = checkPriceAlert(record);
        return (
          <div>
            <div className="num" style={{ fontWeight: '500', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {symbol}
              {alert && (
                <Tooltip title={alert.message}>
                  <BellOutlined aria-label={alert.message} style={{ color: alert.type === 'high' ? 'var(--up-color)' : 'var(--down-color)' }} />
                </Tooltip>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{record.name}</div>
          </div>
        );
      }
    },
    {
      title: '现价',
      dataIndex: ['quote', 'price'],
      width: 90,
      align: 'right',
      render: (price) => (
        <span className="num" style={{ fontWeight: '500' }}>
          ¥{price?.toFixed(2)}
        </span>
      )
    },
    {
      title: '涨跌',
      dataIndex: ['quote', 'change_percent'],
      width: 85,
      align: 'center',
      render: (change) => <ChangeDisplay value={change} />
    },
    {
      title: '成交额',
      dataIndex: ['quote', 'volume'],
      width: 100,
      align: 'right',
      render: (volume) => (
        <span className="num" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {volume ? `${(volume / 10000).toFixed(0)}万` : '-'}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button 
              icon={<LineChartOutlined />} 
              size="small"
              onClick={() => {
                if (onSelectStock) {
                  onSelectStock(record);
                } else {
                  showStockDetail(record);
                }
              }}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button 
              icon={<EditOutlined />} 
              size="small"
              onClick={() => showEditModal(record)}
            />
          </Tooltip>
          <Tooltip title="移除自选">
            <Popconfirm
              title="确定从自选列表移除？"
              onConfirm={() => removeFromWatchlist(record.symbol)}
              okText="确定"
              cancelText="取消"
            >
              <Button 
                icon={<DeleteOutlined />} 
                size="small"
                danger
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      )
    }
  ];

  // 如果在表格中显示（作为按钮）
  if (showInTable) {
    return { addToWatchlist, removeFromWatchlist, isInWatchlist, watchlist };
  }

  return (
    <>
      <LuxuryCard 
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <StarFilled aria-hidden="true" style={{ color: 'var(--text-secondary)', fontSize: '14px' }} />
              <span>自选股</span>
              <Badge 
                count={stats.total || watchlist.length} 
                showZero
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', boxShadow: '0 0 0 1px var(--border-color)', fontFamily: 'var(--font-mono)' }} 
              />
              {useBackend && stats.with_alerts > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>
                  <span className="status-dot" style={{ color: 'var(--warning-color)' }} aria-hidden="true" />
                  <span className="num">{stats.with_alerts}</span> 预警
                </span>
              )}
            </div>
            <Space size="small">
              <Tooltip title="刷新">
                <Button 
                  icon={<ReloadOutlined />} 
                  size="small"
                  onClick={() => useBackend ? loadWatchlistFromBackend() : fetchStockDataFromLocal()}
                />
              </Tooltip>
              <input
                type="file"
                accept=".json"
                onChange={importWatchlist}
                style={{ display: 'none' }}
                id="watchlist-import"
              />
              <Tooltip title="导入">
                <Button 
                  icon={<ImportOutlined />} 
                  size="small"
                  onClick={() => document.getElementById('watchlist-import').click()}
                />
              </Tooltip>
              <Tooltip title="导出">
                <Button 
                  icon={<ExportOutlined />} 
                  size="small"
                  onClick={exportWatchlist}
                />
              </Tooltip>
              {watchlist.length > 0 && (
                <Popconfirm
                  title="确定清空所有自选股？"
                  onConfirm={clearWatchlist}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button 
                    icon={<DeleteOutlined />} 
                    size="small"
                    danger
                  />
                </Popconfirm>
              )}
            </Space>
          </div>
        }
        className={className}
        style={style}
      >
        {/* 统计卡片 */}
        {watchlist.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
            <Col span={12}>
              <Statistic 
                title="自选股票数" 
                value={stats.total || watchlist.length} 
                valueStyle={{ color: 'var(--text-primary)', fontSize: '20px' }}
              />
            </Col>
            <Col span={12}>
              <Statistic 
                title="已设预警" 
                value={stats.with_alerts || 0} 
                valueStyle={{ color: 'var(--text-primary)', fontSize: '20px' }}
              />
            </Col>
          </Row>
        )}

        {loading && stockData.length === 0 ? (
          <LoadingState text="加载自选股数据..." />
        ) : stockData.length === 0 ? (
          <Empty 
            description="暂无自选股，请从股票列表添加"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={stockData}
            rowKey="symbol"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
          />
        )}
      </LuxuryCard>

      {/* 股票详情弹窗 */}
      <Modal
        title={selectedStock ? `${selectedStock.symbol} ${selectedStock.name}` : '股票详情'}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
        bodyStyle={{ 
          background: 'var(--bg-secondary)',
          padding: '20px'
        }}
      >
        {selectedStock && selectedStock.quote && (
          <div>
            <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
              <Col span={6}>
                <Statistic 
                  title="当前价格" 
                  value={selectedStock.quote.price}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: 'var(--text-primary)' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="涨跌幅" 
                  value={selectedStock.quote.change_percent}
                  precision={2}
                  suffix="%"
                  valueStyle={{ 
                    color: selectedStock.quote.change_percent >= 0 ? 'var(--up-color)' : 'var(--down-color)' 
                  }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="今日最高" 
                  value={selectedStock.quote.high}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: 'var(--up-color)' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="今日最低" 
                  value={selectedStock.quote.low}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: 'var(--down-color)' }}
                />
              </Col>
            </Row>
            
            {/* 预警信息 */}
            {(selectedStock.alert_price_high || selectedStock.alert_price_low) && (
              <div style={{ 
                padding: '12px 16px', 
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                  <BellOutlined /> 价格预警设置
                </div>
                <Space>
                  {selectedStock.alert_price_high && (
                    <span>高价预警: ¥{selectedStock.alert_price_high}</span>
                  )}
                  {selectedStock.alert_price_low && (
                    <span>低价预警: ¥{selectedStock.alert_price_low}</span>
                  )}
                </Space>
              </div>
            )}
            
            {selectedStock.notes && (
              <div style={{ 
                padding: '12px 16px', 
                background: 'var(--bg-tertiary)',
                borderRadius: '8px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>备注</div>
                <div style={{ color: 'var(--text-secondary)' }}>{selectedStock.notes}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑自选股"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        width={500}
      >
        {selectedStock && (
          <Form
            layout="vertical"
            initialValues={{
              alert_price_high: selectedStock.alert_price_high,
              alert_price_low: selectedStock.alert_price_low,
              notes: selectedStock.notes
            }}
            onFinish={updateWatchlistItem}
          >
            <Form.Item label="股票">
              <span style={{ fontWeight: '600' }}>{selectedStock.symbol} {selectedStock.name}</span>
            </Form.Item>
            
            <Form.Item 
              label="高价预警" 
              name="alert_price_high"
              help="当股价达到或超过此价格时提醒"
            >
              <Input type="number" placeholder="输入预警价格" prefix="¥" />
            </Form.Item>
            
            <Form.Item 
              label="低价预警" 
              name="alert_price_low"
              help="当股价达到或低于此价格时提醒"
            >
              <Input type="number" placeholder="输入预警价格" prefix="¥" />
            </Form.Item>
            
            <Form.Item label="备注" name="notes">
              <Input.TextArea rows={3} placeholder="添加备注..." />
            </Form.Item>
            
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />}>
                  保存
                </Button>
                <Button onClick={() => setEditModalVisible(false)}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
};

/**
 * 加入自选按钮组件
 * 用于在股票列表中快速添加/移除自选
 */
export const WatchlistButton = ({ symbol, name, size = 'small', onChange }) => {
  const [isWatched, setIsWatched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkWatchStatus();
  }, [symbol]);

  const checkWatchStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE}/watchlist/check/${symbol}`);
      setIsWatched(response.data.in_watchlist);
    } catch (error) {
      // 后端失败时尝试本地存储
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        const list = JSON.parse(stored);
        setIsWatched(list.some(item => item.symbol === symbol));
      }
    }
  };

  const toggleWatchlist = async () => {
    setLoading(true);
    try {
      if (isWatched) {
        await axios.delete(`${API_BASE}/watchlist/${symbol}`);
        message.success('已从自选列表移除');
      } else {
        await axios.post(`${API_BASE}/watchlist/add?symbol=${symbol}&name=${encodeURIComponent(name || '')}`);
        message.success('已添加到自选列表');
      }
      setIsWatched(!isWatched);
      if (onChange) onChange(!isWatched);
    } catch (error) {
      // 后端失败时切换到本地模式
      const stored = localStorage.getItem(WATCHLIST_KEY);
      let list = stored ? JSON.parse(stored) : [];

      if (isWatched) {
        list = list.filter(item => item.symbol !== symbol);
        message.success('已从自选列表移除');
      } else {
        list.push({ symbol, name, addedAt: new Date().toISOString() });
        message.success('已添加到自选列表（本地）');
      }

      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
      setIsWatched(!isWatched);
      if (onChange) onChange(!isWatched);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title={isWatched ? '移除自选' : '加入自选'}>
      <Button
        type="default"
        icon={isWatched ? <StarFilled /> : <StarOutlined />}
        size={size}
        onClick={toggleWatchlist}
        loading={loading}
        aria-pressed={isWatched}
        aria-label={isWatched ? '移除自选' : '加入自选'}
        style={isWatched ? { color: 'var(--accent)', borderColor: 'var(--accent-line)' } : {}}
      />
    </Tooltip>
  );
};

export default Watchlist;
