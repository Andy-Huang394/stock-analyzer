import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AutoComplete, Input, Spin, Empty } from 'antd';
import { SearchOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import axios from 'axios';
import debounce from 'lodash/debounce';

/**
 * 股票搜索自动补全组件 - 奢华黑金风格
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
  const [isFocused, setIsFocused] = useState(false);
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
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '4px 0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ 
                fontFamily: 'var(--font-mono)',
                fontWeight: '600', 
                fontSize: '14px',
                color: 'var(--gold-primary)',
                minWidth: '60px'
              }}>
                {stock.symbol}
              </span>
              <span style={{ 
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                {stock.name}
              </span>
            </div>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: '500',
              color: stock.change_percent >= 0 ? 'var(--up-color)' : 'var(--down-color)'
            }}>
              {stock.change_percent >= 0 ? <RiseOutlined /> : <FallOutlined />}
              {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent?.toFixed(2)}%
            </div>
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

  const inputSize = size === 'small' ? { height: '36px' } : size === 'large' ? { height: '48px' } : { height: '40px' };

  return (
    <AutoComplete
      options={options}
      onSelect={handleSelect}
      onSearch={handleSearch}
      value={searchValue}
      allowClear={allowClear}
      onClear={handleClear}
      style={{ width: '100%', ...style }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      dropdownStyle={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-gold), var(--shadow-lg)'
      }}
      notFoundContent={
        loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div className="loading-gold" />
          </div>
        ) : searchValue.length > 0 ? (
          <Empty 
            description={<span style={{ color: 'var(--text-muted)' }}>未找到相关股票</span>} 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
          />
        ) : null
      }
    >
      <Input
        size={size}
        placeholder={placeholder}
        prefix={
          <SearchOutlined 
            style={{ 
              color: isFocused ? 'var(--gold-primary)' : 'var(--text-muted)',
              fontSize: '16px',
              transition: 'color 0.3s ease'
            }} 
          />
        }
        style={{
          background: 'var(--bg-tertiary)',
          borderColor: isFocused ? 'var(--gold-primary)' : 'var(--border-color)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-md)',
          transition: 'all 0.3s ease',
          boxShadow: isFocused ? '0 0 0 2px rgba(212, 168, 83, 0.1)' : 'none',
          ...inputSize
        }}
      />
    </AutoComplete>
  );
};

export default StockSearch;
