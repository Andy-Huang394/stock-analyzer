import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, Button, Space, message, Popconfirm, Tooltip, 
  Badge, Modal, Empty 
} from 'antd';
import { 
  StarOutlined, StarFilled, DeleteOutlined,
  LineChartOutlined, BellOutlined, ExportOutlined, ImportOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { LuxuryCard, ChangeDisplay, LoadingState } from './Common';

const WATCHLIST_KEY = 'stock_analyzer_watchlist';

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
  const [selectedStock, setSelectedStock] = useState(null);

  // 从localStorage加载自选股
  const loadWatchlist = useCallback(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 验证数据格式
        if (Array.isArray(parsed)) {
          setWatchlist(parsed);
        }
      }
    } catch (error) {
      console.error('加载自选股失败:', error);
    }
  }, []);

  // 保存自选股到localStorage
  const saveWatchlist = useCallback((list) => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
      setWatchlist(list);
    } catch (error) {
      console.error('保存自选股失败:', error);
      message.error('保存失败');
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // 加载股票数据
  const fetchStockData = useCallback(async () => {
    if (watchlist.length === 0) {
      setStockData([]);
      return;
    }

    setLoading(true);
    try {
      // 并发获取所有自选股的数据
      const promises = watchlist.map(async (item) => {
        try {
          const response = await axios.get(`/api/v1/stocks/${item.symbol}/quote`);
          return {
            ...response.data,
            symbol: item.symbol,
            name: item.name || response.data.name,
            addedAt: item.addedAt
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
    fetchStockData();
    // 设置定时刷新
    const interval = setInterval(fetchStockData, 30000);
    return () => clearInterval(interval);
  }, [fetchStockData]);

  // 添加自选股
  const addToWatchlist = (symbol, name) => {
    if (watchlist.some(item => item.symbol === symbol)) {
      message.info('该股票已在自选列表中');
      return false;
    }

    const newList = [...watchlist, {
      symbol,
      name,
      addedAt: new Date().toISOString()
    }];
    
    saveWatchlist(newList);
    message.success(`已将 ${name || symbol} 添加到自选`);
    return true;
  };

  // 从自选股移除
  const removeFromWatchlist = (symbol) => {
    const newList = watchlist.filter(item => item.symbol !== symbol);
    saveWatchlist(newList);
    message.success('已从自选列表移除');
  };

  // 检查是否在自选股中
  const isInWatchlist = (symbol) => {
    return watchlist.some(item => item.symbol === symbol);
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
  const importWatchlist = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          // 合并现有和导入的，去重
          const merged = [...watchlist];
          imported.forEach(item => {
            if (!merged.some(existing => existing.symbol === item.symbol)) {
              merged.push(item);
            }
          });
          saveWatchlist(merged);
          message.success(`成功导入 ${imported.length} 只股票`);
        } else {
          message.error('文件格式错误');
        }
      } catch (error) {
        message.error('解析文件失败');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // 重置input
  };

  // 显示股票详情
  const showStockDetail = (record) => {
    setSelectedStock(record);
    setDetailModalVisible(true);
  };

  // 表格列定义
  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 100,
      render: (symbol, record) => (
        <div>
          <div style={{ fontWeight: '600', fontSize: '14px' }}>{symbol}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{record.name}</div>
        </div>
      )
    },
    {
      title: '现价',
      dataIndex: 'price',
      width: 90,
      align: 'right',
      render: (price) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '500' }}>
          ¥{price?.toFixed(2)}
        </span>
      )
    },
    {
      title: '涨跌',
      dataIndex: 'change_percent',
      width: 85,
      align: 'center',
      render: (change) => <ChangeDisplay value={change} />
    },
    {
      title: '成交额',
      dataIndex: 'volume',
      width: 100,
      align: 'right',
      render: (volume) => (
        <span style={{ fontSize: '12px' }}>
          {(volume / 10000).toFixed(0)}万
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
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
          <Tooltip title="设置预警">
            <Button 
              icon={<BellOutlined />} 
              size="small"
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
              <StarFilled style={{ color: '#fadb14' }} />
              <span>自选股</span>
              <Badge 
                count={watchlist.length} 
                style={{ backgroundColor: 'var(--primary-color)' }} 
              />
            </div>
            <Space size="small">
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
            </Space>
          </div>
        }
        className={className}
        style={style}
      >
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
        {selectedStock && (
          <div>
            <div style={{ 
              display: 'flex', 
              gap: '16px', 
              marginBottom: '20px',
              padding: '16px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px'
            }}>
              <div>
                <div className="data-label">当前价格</div>
                <div className="data-value" style={{ fontSize: '24px' }}>
                  ¥{selectedStock.price?.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="data-label">涨跌幅</div>
                <div style={{ fontSize: '18px' }}>
                  <ChangeDisplay value={selectedStock.change_percent} />
                </div>
              </div>
              <div>
                <div className="data-label">今日最高</div>
                <div style={{ fontSize: '18px', color: 'var(--success-color)' }}>
                  ¥{selectedStock.high?.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="data-label">今日最低</div>
                <div style={{ fontSize: '18px', color: 'var(--danger-color)' }}>
                  ¥{selectedStock.low?.toFixed(2)}
                </div>
              </div>
            </div>
            <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
              点击K线图表区域查看详细走势
            </div>
          </div>
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

  useEffect(() => {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    if (stored) {
      const list = JSON.parse(stored);
      setIsWatched(list.some(item => item.symbol === symbol));
    }
  }, [symbol]);

  const toggleWatchlist = () => {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    let list = stored ? JSON.parse(stored) : [];

    if (isWatched) {
      list = list.filter(item => item.symbol !== symbol);
      message.success('已从自选列表移除');
    } else {
      list.push({
        symbol,
        name,
        addedAt: new Date().toISOString()
      });
      message.success('已添加到自选列表');
    }

    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    setIsWatched(!isWatched);
    if (onChange) onChange(!isWatched);
  };

  return (
    <Tooltip title={isWatched ? '移除自选' : '加入自选'}>
      <Button
        type={isWatched ? 'primary' : 'default'}
        icon={isWatched ? <StarFilled /> : <StarOutlined />}
        size={size}
        onClick={toggleWatchlist}
        style={isWatched ? { color: '#fadb14', borderColor: '#fadb14' } : {}}
      />
    </Tooltip>
  );
};

export default Watchlist;