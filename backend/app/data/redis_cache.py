"""
Redis缓存管理器
提供高性能分布式缓存，支持自动降级到SQLite
"""
import json
import pickle
import hashlib
import logging
from typing import Optional, Any, Union
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

try:
    import redis
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None
    aioredis = None

from app.core.config import settings

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis缓存管理器 - 支持同步和异步操作"""
    
    def __init__(self):
        self._sync_client: Optional[redis.Redis] = None
        self._async_client: Optional[aioredis.Redis] = None
        self._enabled = settings.REDIS_ENABLED and REDIS_AVAILABLE
        self._host = settings.REDIS_HOST
        self._port = settings.REDIS_PORT
        self._db = settings.REDIS_DB
        self._password = settings.REDIS_PASSWORD or None
        self._default_ttl = settings.REDIS_CACHE_TTL
        
    def _get_sync_client(self) -> Optional[redis.Redis]:
        """获取同步Redis客户端"""
        if not self._enabled:
            return None
        
        if self._sync_client is None:
            try:
                self._sync_client = redis.Redis(
                    host=self._host,
                    port=self._port,
                    db=self._db,
                    password=self._password,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    health_check_interval=30
                )
                # 测试连接
                self._sync_client.ping()
                logger.info(f"Redis同步连接成功: {self._host}:{self._port}")
            except Exception as e:
                logger.warning(f"Redis连接失败，将使用SQLite缓存: {e}")
                self._enabled = False
                return None
        
        return self._sync_client
    
    async def _get_async_client(self) -> Optional[aioredis.Redis]:
        """获取异步Redis客户端"""
        if not self._enabled:
            return None
        
        if self._async_client is None:
            try:
                self._async_client = aioredis.Redis(
                    host=self._host,
                    port=self._port,
                    db=self._db,
                    password=self._password,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                # 测试连接
                await self._async_client.ping()
                logger.info(f"Redis异步连接成功: {self._host}:{self._port}")
            except Exception as e:
                logger.warning(f"Redis异步连接失败: {e}")
                return None
        
        return self._async_client
    
    def _make_key(self, key: str, prefix: str = "") -> str:
        """生成带前缀的key"""
        if prefix:
            return f"stock_analyzer:{prefix}:{key}"
        return f"stock_analyzer:{key}"
    
    def _serialize(self, value: Any) -> str:
        """序列化值"""
        if isinstance(value, (str, int, float, bool)):
            return json.dumps(value)
        try:
            return pickle.dumps(value).hex()
        except Exception as e:
            logger.error(f"序列化失败: {e}")
            return json.dumps(str(value))
    
    def _deserialize(self, value: str) -> Any:
        """反序列化值"""
        if value is None:
            return None
        
        # 尝试pickle反序列化
        try:
            return pickle.loads(bytes.fromhex(value))
        except:
            pass
        
        # 尝试JSON反序列化
        try:
            return json.loads(value)
        except:
            pass
        
        return value
    
    # ==================== 同步方法 ====================
    
    def get(self, key: str, prefix: str = "") -> Optional[Any]:
        """同步获取缓存"""
        client = self._get_sync_client()
        if not client:
            return None
        
        try:
            full_key = self._make_key(key, prefix)
            value = client.get(full_key)
            if value is not None:
                logger.debug(f"Redis缓存命中: {full_key}")
                return self._deserialize(value)
            return None
        except Exception as e:
            logger.error(f"Redis get失败: {e}")
            return None
    
    def set(
        self, 
        key: str, 
        value: Any, 
        ttl: Optional[int] = None, 
        prefix: str = ""
    ) -> bool:
        """同步设置缓存"""
        client = self._get_sync_client()
        if not client:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            serialized = self._serialize(value)
            ttl = ttl or self._default_ttl
            
            client.setex(full_key, ttl, serialized)
            logger.debug(f"Redis缓存设置: {full_key}, TTL={ttl}s")
            return True
        except Exception as e:
            logger.error(f"Redis set失败: {e}")
            return False
    
    def delete(self, key: str, prefix: str = "") -> bool:
        """同步删除缓存"""
        client = self._get_sync_client()
        if not client:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            client.delete(full_key)
            return True
        except Exception as e:
            logger.error(f"Redis delete失败: {e}")
            return False
    
    def exists(self, key: str, prefix: str = "") -> bool:
        """检查缓存是否存在"""
        client = self._get_sync_client()
        if not client:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            return client.exists(full_key) > 0
        except Exception as e:
            logger.error(f"Redis exists失败: {e}")
            return False
    
    def ttl(self, key: str, prefix: str = "") -> int:
        """获取缓存剩余时间"""
        client = self._get_sync_client()
        if not client:
            return -2
        
        try:
            full_key = self._make_key(key, prefix)
            return client.ttl(full_key)
        except Exception as e:
            logger.error(f"Redis ttl失败: {e}")
            return -2
    
    def clear_prefix(self, prefix: str) -> bool:
        """清除指定前缀的所有缓存"""
        client = self._get_sync_client()
        if not client:
            return False
        
        try:
            pattern = f"stock_analyzer:{prefix}:*"
            keys = client.keys(pattern)
            if keys:
                client.delete(*keys)
                logger.info(f"清除缓存前缀: {prefix}, 共 {len(keys)} 条")
            return True
        except Exception as e:
            logger.error(f"Redis clear_prefix失败: {e}")
            return False
    
    # ==================== 异步方法 ====================
    
    async def aget(self, key: str, prefix: str = "") -> Optional[Any]:
        """异步获取缓存"""
        client = await self._get_async_client()
        if not client:
            return None
        
        try:
            full_key = self._make_key(key, prefix)
            value = await client.get(full_key)
            if value is not None:
                return self._deserialize(value)
            return None
        except Exception as e:
            logger.error(f"Redis async get失败: {e}")
            return None
    
    async def aset(
        self, 
        key: str, 
        value: Any, 
        ttl: Optional[int] = None, 
        prefix: str = ""
    ) -> bool:
        """异步设置缓存"""
        client = await self._get_async_client()
        if not client:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            serialized = self._serialize(value)
            ttl = ttl or self._default_ttl
            
            await client.setex(full_key, ttl, serialized)
            return True
        except Exception as e:
            logger.error(f"Redis async set失败: {e}")
            return False
    
    async def adelete(self, key: str, prefix: str = "") -> bool:
        """异步删除缓存"""
        client = await self._get_async_client()
        if not client:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            await client.delete(full_key)
            return True
        except Exception as e:
            logger.error(f"Redis async delete失败: {e}")
            return False
    
    async def apublish(self, channel: str, message: Any) -> bool:
        """发布消息到频道"""
        client = await self._get_async_client()
        if not client:
            return False
        
        try:
            if isinstance(message, (dict, list)):
                message = json.dumps(message)
            await client.publish(channel, message)
            return True
        except Exception as e:
            logger.error(f"Redis publish失败: {e}")
            return False
    
    # ==================== 特定用途方法 ====================
    
    def cache_analysis(
        self, 
        symbol: str, 
        data: dict, 
        ttl: int = 900  # 15分钟
    ) -> bool:
        """缓存股票分析结果"""
        return self.set(symbol, data, ttl=ttl, prefix="analysis")
    
    def get_analysis(self, symbol: str) -> Optional[dict]:
        """获取股票分析结果缓存"""
        return self.get(symbol, prefix="analysis")
    
    def cache_history(
        self, 
        symbol: str, 
        data: Any, 
        ttl: int = 86400  # 1天
    ) -> bool:
        """缓存历史数据"""
        return self.set(symbol, data, ttl=ttl, prefix="history")
    
    def get_history(self, symbol: str) -> Optional[Any]:
        """获取历史数据缓存"""
        return self.get(symbol, prefix="history")
    
    def cache_realtime(self, data: dict, ttl: int = 120) -> bool:
        """缓存实时数据"""
        return self.set("all", data, ttl=ttl, prefix="realtime")
    
    def get_realtime(self) -> Optional[dict]:
        """获取实时数据缓存"""
        return self.get("all", prefix="realtime")
    
    # ==================== 缓存装饰器工厂 ====================
    
    def cached(
        self, 
        ttl: int = 300, 
        prefix: str = "",
        key_func: Optional[callable] = None
    ):
        """缓存装饰器 - 用于函数结果缓存"""
        def decorator(func):
            def wrapper(*args, **kwargs):
                # 生成缓存key
                if key_func:
                    cache_key = key_func(*args, **kwargs)
                else:
                    # 默认使用函数名+参数hash
                    key_parts = [func.__name__]
                    key_parts.extend(str(a) for a in args)
                    key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                    cache_key = hashlib.md5(
                        ":".join(key_parts).encode()
                    ).hexdigest()
                
                # 尝试获取缓存
                cached_value = self.get(cache_key, prefix)
                if cached_value is not None:
                    return cached_value
                
                # 执行函数
                result = func(*args, **kwargs)
                
                # 保存到缓存
                self.set(cache_key, result, ttl=ttl, prefix=prefix)
                
                return result
            
            return wrapper
        return decorator
    
    # ==================== 健康检查 ====================
    
    def health_check(self) -> dict:
        """健康检查"""
        if not self._enabled or not REDIS_AVAILABLE:
            return {
                "status": "disabled",
                "enabled": False,
                "available": REDIS_AVAILABLE,
                "connected": False
            }
        
        client = self._get_sync_client()
        if not client:
            return {
                "status": "error",
                "enabled": True,
                "available": True,
                "connected": False
            }
        
        try:
            info = client.info()
            return {
                "status": "healthy",
                "enabled": True,
                "available": True,
                "connected": True,
                "version": info.get("redis_version"),
                "used_memory_human": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients")
            }
        except Exception as e:
            return {
                "status": "error",
                "enabled": True,
                "available": True,
                "connected": False,
                "error": str(e)
            }


# 全局Redis缓存实例
redis_cache = RedisCache()
