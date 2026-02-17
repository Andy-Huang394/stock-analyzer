import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AutoComplete, Input, Spin, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import axios from 'axios';
import debounce from 'lodash/debounce';

/**
 * 股票搜索自动补全组件
 * @param {function} onSelect - 选中股票回调 (symbol, name) => {}
 * @param {string} placeholder - 占位文本
 * @param {string} value - 当前值
 * @param {function} onChange - 值变化回调
 * @param {boolean} allowClear - 是否允许清空
 * @param {string} size - 输入框大小
 * @param {object} style - 样式
 */
const StockSearch = ({ 
  onSelect, 
  placeholder = '搜索股票代码或名称...',
  value,
  onChange,
  allowClear = true,
  size = 'middle',
  style = {}
}) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState(value || '');
  const abortControllerRef = useRef(null);

  // 搜索股票
  const searchStocks = useCallback(async (keyword) => {
    if (!keyword || keyword.length < 1) {
      setOptions([]);
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const response = await axios.get('/api/v1/stocks/search', {
        params: { keyword, limit: 10 },
        signal: abortControllerRef.current.signal
      });

      const results = response.data.map(stock => ({
        value: stock.symbol,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 'bold', marginRight: '8px' }}>{stock.symbol}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{stock.name}</span>
            </div>
            <span style={{ 
              fontSize: '12px', 
              color: stock.change_percent >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
            }}>
              {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2)}%
            </span>
          </div>
        ),
        symbol: stock.symbol,
        name: stock.name,
        stockData: stock
      }));

      setOptions(results);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('搜索股票失败:', error);
        setOptions([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 防抖搜索
  const debouncedSearch = useRef(
    debounce((value) => searchStocks(value), 300)
  ).current;

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // 处理输入变化
  const handleSearch = (value) => {
    setSearchValue(value);
    debouncedSearch(value);
    if (onChange) onChange(value);
  };

  // 处理选中
  const handleSelect = (value, option) => {
    setSearchValue(option.name);
    if (onSelect) {
      onSelect(option.symbol, option.name, option.stockData);
    }
  };

  // 处理清空
  const handleClear = () => {
    setSearchValue('');
    setOptions([]);
    if (onChange) onChange('');
  };

  return (
    <AutoComplete
      options={options}
      onSelect={handleSelect}
      onSearch={handleSearch}
      value={searchValue}
      allowClear={allowClear}
      onClear={handleClear}
      style={{ width: '100%', ...style }}
      notFoundContent={
        loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : searchValue.length > 0 ? (
          <Empty description="未找到相关股票" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null
      }
    >
      <Input
        size={size}
        placeholder={placeholder}
        prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
        style={{
          background: 'var(--bg-tertiary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)'
        }}
      />
    </AutoComplete>
  );
};

export default StockSearch;