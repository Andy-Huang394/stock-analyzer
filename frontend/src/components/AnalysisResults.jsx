import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, Button, Space, Tag, Tooltip, Select, message, 
  Input, Dropdown, Checkbox
} from 'antd';
import { 
  ReloadOutlined, ExperimentOutlined, StarOutlined, StarFilled,
  FilterOutlined, BarChartOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { SciFiCard, ScoreBadge, ChangeDisplay } from './Common';
import { QuickAlertButton } from './PriceAlert';
import StockSearch from './StockSearch';
import axios from 'axios';

const WATCHLIST_KEY = 'stock_analyzer_watchlist';

/**
 * 分析结果列表 - 增强版
 * 新增功能：
 * - 自选股快捷操作
 * - 股票搜索
 * - 列显示控制
 * - 快速预警
 */
const AnalysisResults = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sortBy, setSortBy] = useState('score');
  const [maxStocks, setMaxStocks] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [watchlist, setWatchlist] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([
    'rank', 'symbol', 'score', 'price', 'change', 'probability', 'trend', 'signals', 'actions'
  ]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });

  // 加载自选股
  const loadWatchlist = useCallback(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch (error) {
      console.error('加载自选股失败:', error);
    }
  }, []);

  // 获取结果
  const fetchResults = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      
      // 先获取总数
      const countResponse = await axios.get(
        `/api/v1/analysis/results?count_only=true`
      );
      const totalFromHeader = countResponse.headers['x-total-count'];
      const total = totalFromHeader ? parseInt(totalFromHeader) : totalCount;
      
      // 再获取当前页数据
      const response = await axios.get(
        `/api/v1/analysis/results?limit=${pageSize}&offset=${offset}&sort_by=${sortBy}`
      );
      
      setData(response.data);
      setFilteredData(response.data);
      setPagination({
        current: page,
        pageSize: pageSize,
        total: total
      });
    } catch (error) {
      console.error('获取分析结果失败:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [sortBy, totalCount]);

  // 初始加载
  useEffect(() => {
    fetchResults(1, 20);
    loadWatchlist();
  }, [fetchResults, loadWatchlist]);

  // 排序变化时重新加载
  useEffect(() => {
    fetchResults(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  // 搜索过滤
  useEffect(() => {
    if (!searchText) {
      setFilteredData(data);
      return;
    }
    
    const filtered = data.filter(item => 
      item.symbol.toLowerCase().includes(searchText.toLowerCase()) ||
      item.name.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredData(filtered);
  }, [searchText, data]);

  const runAnalysis = async () => {
    if (maxStocks > 200) {
      message.warning('最多支持分析200只股票');
      return;
    }
    
    setAnalyzing(true);
    message.info(`开始分析前 ${maxStocks} 只市值最大的股票，请耐心等待...`);
    
    try {
      const response = await axios.post('/api/v1/analysis/run', null, { 
        params: { max_stocks: maxStocks },
        timeout: 300000
      });
      const count = response.data.analyzed_count;
      setTotalCount(count);
      setPagination(prev => ({ ...prev, total: count }));
      message.success(`分析完成！共分析 ${count} 只股票`);
      await fetchResults(1, pagination.pageSize);
    } catch (error) {
      console.error('运行分析失败:', error);
      message.error('分析失败，请重试');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTableChange = (newPagination) => {
    fetchResults(newPagination.current, newPagination.pageSize);
  };

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'up': return 'var(--success-color)';
      case 'down': return 'var(--danger-color)';
      default: return 'var(--warning-color)';
    }
  };

  const getTrendText = (trend) => {
    switch (trend) {
      case 'up': return '上涨';
      case 'down': return '下跌';
      default: return '震荡';
    }
  };

  // 计算实际排名
  const getRealRank = (index) => {
    return (pagination.current - 1) * pagination.pageSize + index + 1;
  };

  // 添加到自选股
  const addToWatchlist = (record) => {
    if (watchlist.some(item => item.symbol === record.symbol)) {
      message.info('该股票已在自选列表中');
      return;
    }

    const newList = [...watchlist, {
      symbol: record.symbol,
      name: record.name,
      addedAt: new Date().toISOString()
    }];
    
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
    setWatchlist(newList);
    message.success(`已将 ${record.name || record.symbol} 添加到自选`);
  };

  // 从自选股移除
  const removeFromWatchlist = (symbol) => {
    const newList = watchlist.filter(item => item.symbol !== symbol);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newList));
    setWatchlist(newList);
    message.success('已从自选列表移除');
  };

  // 检查是否在自选股中
  const isInWatchlist = (symbol) => {
    return watchlist.some(item => item.symbol === symbol);
  };

  // 列定义
  const allColumns = [
    {
      key: 'rank',
      title: '排名',
      width: 60,
      align: 'center',
      render: (_, __, index) => {
        const rank = getRealRank(index);
        const bgColor = rank <= 3 ? 'var(--danger-color)' : rank <= 10 ? 'var(--warning-color)' : 'var(--text-muted)';
        return (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '22px',
            height: '22px',
            padding: '0 6px',
            borderRadius: '11px',
            backgroundColor: bgColor,
            color: '#fff',
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)'
          }}>
            {rank}
          </div>
        );
      }
    },
    {
      key: 'symbol',
      title: '股票',
      dataIndex: 'symbol',
      width: 110,
      render: (symbol, record) => (
        <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/stock/${symbol}`)}>
          <div style={{ fontWeight: '600', fontSize: '14px' }}>{symbol}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{record.name}</div>
        </div>
      )
    },
    {
      key: 'score',
      title: '评分',
      dataIndex: 'total_score',
      width: 80,
      align: 'center',
      sorter: false,
      render: (score) => <ScoreBadge score={score} />
    },
    {
      key: 'price',
      title: '现价',
      dataIndex: 'price',
      width: 85,
      align: 'right',
      render: (price) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '500' }}>
          ¥{price?.toFixed(2)}
        </span>
      )
    },
    {
      key: 'change',
      title: '涨跌',
      dataIndex: 'change_percent',
      width: 85,
      align: 'center',
      render: (change) => <ChangeDisplay value={change} />
    },
    {
      key: 'probability',
      title: '上涨概率',
      width: 80,
      align: 'center',
      children: [
        {
          title: '即时',
          dataIndex: 'up_probability',
          width: 65,
          align: 'center',
          render: (prob) => prob ? (
            <span style={{ 
              color: prob >= 0.6 ? 'var(--success-color)' : prob <= 0.4 ? 'var(--danger-color)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '13px'
            }}>
              {(prob * 100).toFixed(0)}%
            </span>
          ) : '-'
        },
        {
          title: '1日',
          dataIndex: 'up_probability_1d',
          width: 65,
          align: 'center',
          render: (prob) => prob ? (
            <span style={{ 
              color: prob >= 0.6 ? 'var(--success-color)' : prob <= 0.4 ? 'var(--danger-color)' : 'var(--text-secondary)',
              fontWeight: 500,
              fontSize: '12px'
            }}>
              {(prob * 100).toFixed(0)}%
            </span>
          ) : '-'
        },
        {
          title: '7日',
          dataIndex: 'up_probability_7d',
          width: 65,
          align: 'center',
          render: (prob) => prob ? (
            <span style={{ 
              color: prob >= 0.6 ? 'var(--success-color)' : prob <= 0.4 ? 'var(--danger-color)' : 'var(--text-secondary)',
              fontWeight: 500,
              fontSize: '12px'
            }}
            >
              {(prob * 100).toFixed(0)}%
            </span>
          ) : '-'
        }
      ]
    },
    {
      key: 'trend',
      title: '趋势',
      dataIndex: 'trend_direction',
      width: 80,
      align: 'center',
      render: (trend) => (
        <Tag style={{ 
          background: 'transparent',
          border: `1px solid ${getTrendColor(trend)}`,
          color: getTrendColor(trend),
          fontSize: '12px',
          padding: '0 8px'
        }}>
          {getTrendText(trend)}
        </Tag>
      )
    },
    {
      key: 'signals',
      title: '信号',
      dataIndex: 'signals',
      width: 180,
      render: (signals) => (
        <Space size="small" wrap>
          {signals?.slice(0, 4).map((signal, idx) => {
            let color = 'var(--text-muted)';
            if (signal.signal > 0) color = 'var(--success-color)';
            else if (signal.signal < 0) color = 'var(--danger-color)';
            
            return (
              <Tooltip key={idx} title={signal.description}>
                <span style={{ 
                  fontSize: '10px',
                  color: color,
                  border: `1px solid ${color}`,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  opacity: 0.7
                }}>
                  {signal.name}
                </span>
              </Tooltip>
            );
          })}
        </Space>
      )
    },
    {
      key: 'actions',
      title: '操作',
      width: 120,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看图表">
            <Button 
              icon={<BarChartOutlined />} 
              size="small"
              onClick={() => navigate(`/stock/${record.symbol}`)}
            />
          </Tooltip>
          
          <Tooltip title={isInWatchlist(record.symbol) ? '移除自选' : '加入自选'}>
            <Button 
              icon={isInWatchlist(record.symbol) ? <StarFilled /> : <StarOutlined />}
              size="small"
              type={isInWatchlist(record.symbol) ? 'primary' : 'default'}
              style={isInWatchlist(record.symbol) ? { color: '#fadb14', borderColor: '#fadb14' } : {}}
              onClick={() => {
                if (isInWatchlist(record.symbol)) {
                  removeFromWatchlist(record.symbol);
                } else {
                  addToWatchlist(record);
                }
              }}
            />
          </Tooltip>
          
          <QuickAlertButton 
            symbol={record.symbol} 
            name={record.name}
            currentPrice={record.price}
            size="small"
          />
        </Space>
      )
    }
  ];

  // 根据选择的列过滤
  const columns = allColumns.filter(col => selectedColumns.includes(col.key));

  // 列选择菜单
  const columnOptions = [
    { label: '排名', value: 'rank' },
    { label: '股票代码', value: 'symbol' },
    { label: '评分', value: 'score' },
    { label: '现价', value: 'price' },
    { label: '涨跌', value: 'change' },
    { label: '上涨概率', value: 'probability' },
    { label: '趋势', value: 'trend' },
    { label: '信号', value: 'signals' },
    { label: '操作', value: 'actions' },
  ];

  return (
    <SciFiCard 
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>智能选股分析</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <StockSearch 
              size="small"
              placeholder="搜索股票..."
              style={{ width: 200 }}
              onSelect={(symbol) => navigate(`/stock/${symbol}`)}
            />
          </div>
        </div>
      }
      style={{ marginTop: '24px' }}
    >
      {/* 控制栏 */}
      <div style={{ 
        marginBottom: '20px',
        padding: '16px',
        background: 'var(--bg-tertiary)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>分析数量:</span>
          <Select
            value={maxStocks}
            onChange={setMaxStocks}
            disabled={analyzing}
            style={{ width: 90 }}
            size="small"
            options={[
              { value: 20, label: '20只' },
              { value: 50, label: '50只' },
              { value: 100, label: '100只' },
              { value: 200, label: '200只' },
            ]}
          />
        </div>

        <Space>
          <Button 
            type="primary"
            icon={<ExperimentOutlined />}
            loading={analyzing}
            onClick={runAnalysis}
            size="small"
          >
            {analyzing ? '分析中...' : '运行分析'}
          </Button>
          
          <Button 
            icon={<ReloadOutlined />}
            onClick={() => fetchResults(pagination.current, pagination.pageSize)}
            loading={loading}
            size="small"
          >
            刷新
          </Button>
        </Space>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          <Input.Search
            placeholder="筛选股票..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="small"
            style={{ width: 150 }}
            allowClear
          />
          
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>排序:</span>
          <Select
            value={sortBy}
            onChange={setSortBy}
            style={{ width: 110 }}
            size="small"
            options={[
              { value: 'score', label: '综合评分' },
              { value: 'probability', label: '上涨概率' },
              { value: 'change', label: '涨跌幅' },
            ]}
          />
          
          <Dropdown
            menu={{
              items: [
                {
                  key: 'columns',
                  label: (
                    <div style={{ minWidth: '150px' }}>
                      <Checkbox.Group
                        options={columnOptions}
                        value={selectedColumns}
                        onChange={setSelectedColumns}
                      />
                    </div>
                  )
                }
              ]
            }}
            trigger={['click']}
          >
            <Button icon={<FilterOutlined />} size="small">
              列显示
            </Button>
          </Dropdown>
        </div>
      </div>

      {/* 统计信息 */}
      <div style={{ 
        marginBottom: '16px', 
        fontSize: '13px', 
        color: 'var(--text-secondary)',
        display: 'flex',
        gap: '20px'
      }}>
        <span>
          共 <strong style={{ color: 'var(--text-primary)' }}>{searchText ? filteredData.length : pagination.total}</strong> 只股票
        </span>
        <span>
          当前第 <strong style={{ color: 'var(--text-primary)' }}>{pagination.current}</strong> 页
        </span>
        
        {searchText && (
          <span style={{ color: 'var(--primary-color)' }}>
            (搜索: "{searchText}")
          </span>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={searchText ? filteredData : data}
        rowKey="symbol"
        loading={loading}
        pagination={searchText ? false : {
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} / 共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
          position: ['bottomCenter'],
        }}
        onChange={handleTableChange}
        scroll={{ x: 1200, y: 600 }}
        size="small"
      />
    </SciFiCard>
  );
};

export default AnalysisResults;