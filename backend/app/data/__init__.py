"""
数据模块
包含数据获取、缓存和基本面数据功能
"""
from app.data.cache import DataCache, data_cache

__all__ = ["DataCache", "data_cache"]

# 尝试导入Redis缓存（可选）
try:
    from app.data.redis_cache import RedisCache, redis_cache, REDIS_AVAILABLE
    __all__.extend(["RedisCache", "redis_cache", "REDIS_AVAILABLE"])
except ImportError:
    REDIS_AVAILABLE = False
    redis_cache = None

# 尝试导入基本面数据模块（可选）
try:
    from app.data.fundamentals import (
        FundamentalData, 
        FundamentalFetcher, 
        fundamental_fetcher
    )
    __all__.extend(["FundamentalData", "FundamentalFetcher", "fundamental_fetcher"])
except ImportError:
    pass
