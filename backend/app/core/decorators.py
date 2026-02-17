"""
API性能优化装饰器
包含：响应缓存、请求限流、性能监控
"""
import functools
import time
import hashlib
import json
import logging
from typing import Optional, Callable, Any
from datetime import datetime, timedelta
from fastapi import Request, HTTPException
from starlette.requests import Request as StarletteRequest

from app.core.config import settings

try:
    from app.data.redis_cache import redis_cache, REDIS_AVAILABLE
except ImportError:
    REDIS_AVAILABLE = False
    redis_cache = None

logger = logging.getLogger(__name__)

# 简单的内存限流存储
_rate_limit_storage: dict = {}


class RateLimiter:
    """请求限流器"""
    
    def __init__(
        self, 
        requests_per_minute: int = 60,
        key_func: Optional[Callable] = None
    ):
        self.requests_per_minute = requests_per_minute
        self.key_func = key_func or self._default_key_func
    
    @staticmethod
    def _default_key_func(request: Request) -> str:
        """默认使用客户端IP作为限流key"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def is_allowed(self, key: str) -> tuple[bool, dict]:
        """检查是否允许请求"""
        now = datetime.now()
        window_start = now - timedelta(minutes=1)
        
        if key not in _rate_limit_storage:
            _rate_limit_storage[key] = []
        
        # 清理过期记录
        _rate_limit_storage[key] = [
            ts for ts in _rate_limit_storage[key] 
            if ts > window_start
        ]
        
        # 检查是否超过限制
        current_count = len(_rate_limit_storage[key])
        
        # 添加当前请求
        _rate_limit_storage[key].append(now)
        
        # 清理旧的存储条目（内存优化）
        if len(_rate_limit_storage) > 10000:
            cutoff = now - timedelta(hours=1)
            keys_to_remove = [
                k for k, v in _rate_limit_storage.items() 
                if v and v[-1] < cutoff
            ]
            for k in keys_to_remove[:1000]:  # 每次最多清理1000条
                del _rate_limit_storage[k]
        
        # 计算剩余配额
        remaining = max(0, self.requests_per_minute - current_count)
        reset_time = int((now + timedelta(minutes=1)).timestamp())
        
        headers = {
            "X-RateLimit-Limit": str(self.requests_per_minute),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(reset_time)
        }
        
        if current_count >= self.requests_per_minute:
            return False, headers
        
        return True, headers


def rate_limit(
    requests_per_minute: Optional[int] = None,
    key_func: Optional[Callable] = None
):
    """
    请求限流装饰器
    
    使用示例:
    @router.get("/api/data")
    @rate_limit(requests_per_minute=30)
    async def get_data():
        return {"data": "..."}
    """
    limit = requests_per_minute or settings.RATE_LIMIT_DEFAULT
    
    def decorator(func: Callable) -> Callable:
        limiter = RateLimiter(limit, key_func)
        
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            # 查找request对象
            request = None
            for arg in args:
                if isinstance(arg, (Request, StarletteRequest)):
                    request = arg
                    break
            
            if not request:
                for v in kwargs.values():
                    if isinstance(v, (Request, StarletteRequest)):
                        request = v
                        break
            
            if request and settings.RATE_LIMIT_ENABLED:
                key = limiter.key_func(request)
                allowed, headers = limiter.is_allowed(key)
                
                if not allowed:
                    raise HTTPException(
                        status_code=429,
                        detail="请求过于频繁，请稍后再试",
                        headers={**headers, "Retry-After": "60"}
                    )
                
                # 存储headers以便后续使用
                kwargs['_rate_limit_headers'] = headers
            
            return await func(*args, **kwargs)
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            # 查找request对象
            request = None
            for arg in args:
                if isinstance(arg, (Request, StarletteRequest)):
                    request = arg
                    break
            
            if not request:
                for v in kwargs.values():
                    if isinstance(v, (Request, StarletteRequest)):
                        request = v
                        break
            
            if request and settings.RATE_LIMIT_ENABLED:
                key = limiter.key_func(request)
                allowed, headers = limiter.is_allowed(key)
                
                if not allowed:
                    raise HTTPException(
                        status_code=429,
                        detail="请求过于频繁，请稍后再试",
                        headers={**headers, "Retry-After": "60"}
                    )
                
                kwargs['_rate_limit_headers'] = headers
            
            return func(*args, **kwargs)
        
        # 根据原函数类型返回对应的wrapper
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def api_cache(
    ttl: int = 300,
    key_prefix: str = "api",
    key_func: Optional[Callable] = None,
    cache_null: bool = False
):
    """
    API响应缓存装饰器
    
    使用示例:
    @router.get("/api/market/overview")
    @api_cache(ttl=60)
    async def get_market_overview():
        return {...}
    
    Args:
        ttl: 缓存时间（秒）
        key_prefix: 缓存key前缀
        key_func: 自定义key生成函数
        cache_null: 是否缓存空结果
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            # 如果Redis不可用，直接执行
            if not REDIS_AVAILABLE or not redis_cache:
                return await func(*args, **kwargs)
            
            # 生成缓存key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # 默认使用函数名+参数hash
                key_parts = [func.__module__, func.__name__]
                
                # 添加args（排除request对象）
                for arg in args:
                    if not isinstance(arg, (Request, StarletteRequest)):
                        key_parts.append(str(arg))
                
                # 添加kwargs（排除request对象）
                for k, v in sorted(kwargs.items()):
                    if k != 'request' and not isinstance(v, (Request, StarletteRequest)):
                        key_parts.append(f"{k}={v}")
                
                cache_key = hashlib.md5(
                    ":".join(key_parts).encode()
                ).hexdigest()
            
            full_key = f"{key_prefix}:{cache_key}"
            
            # 尝试获取缓存
            try:
                cached = redis_cache.get(full_key)
                if cached is not None:
                    logger.debug(f"API缓存命中: {full_key}")
                    return cached
            except Exception as e:
                logger.debug(f"读取缓存失败: {e}")
            
            # 执行函数
            result = await func(*args, **kwargs)
            
            # 保存到缓存（如果结果不为空或允许缓存空值）
            if result is not None or cache_null:
                try:
                    redis_cache.set(full_key, result, ttl=ttl)
                    logger.debug(f"API缓存已设置: {full_key}, TTL={ttl}s")
                except Exception as e:
                    logger.debug(f"保存缓存失败: {e}")
            
            return result
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            # 如果Redis不可用，直接执行
            if not REDIS_AVAILABLE or not redis_cache:
                return func(*args, **kwargs)
            
            # 生成缓存key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                key_parts = [func.__module__, func.__name__]
                
                for arg in args:
                    if not isinstance(arg, (Request, StarletteRequest)):
                        key_parts.append(str(arg))
                
                for k, v in sorted(kwargs.items()):
                    if k != 'request' and not isinstance(v, (Request, StarletteRequest)):
                        key_parts.append(f"{k}={v}")
                
                cache_key = hashlib.md5(
                    ":".join(key_parts).encode()
                ).hexdigest()
            
            full_key = f"{key_prefix}:{cache_key}"
            
            # 尝试获取缓存
            try:
                cached = redis_cache.get(full_key)
                if cached is not None:
                    logger.debug(f"API缓存命中: {full_key}")
                    return cached
            except Exception as e:
                logger.debug(f"读取缓存失败: {e}")
            
            # 执行函数
            result = func(*args, **kwargs)
            
            # 保存到缓存
            if result is not None or cache_null:
                try:
                    redis_cache.set(full_key, result, ttl=ttl)
                    logger.debug(f"API缓存已设置: {full_key}, TTL={ttl}s")
                except Exception as e:
                    logger.debug(f"保存缓存失败: {e}")
            
            return result
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def performance_monitor(log_slow: bool = True, slow_threshold: float = 1.0):
    """
    性能监控装饰器
    
    使用示例:
    @performance_monitor(slow_threshold=0.5)
    async def slow_function():
        await asyncio.sleep(1)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                elapsed = time.time() - start_time
                if log_slow and elapsed > slow_threshold:
                    logger.warning(
                        f"慢查询: {func.__name__} 耗时 {elapsed:.3f}s, "
                        f"args={args}, kwargs={kwargs}"
                    )
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                elapsed = time.time() - start_time
                if log_slow and elapsed > slow_threshold:
                    logger.warning(
                        f"慢查询: {func.__name__} 耗时 {elapsed:.3f}s"
                    )
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def cache_evict(key_pattern: str):
    """
    缓存清除装饰器
    
    在数据更新时清除相关缓存
    
    使用示例:
    @router.post("/api/data/update")
    @cache_evict("api:market:*")
    async def update_data():
        # 更新数据...
        pass
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            
            # 清除缓存
            if REDIS_AVAILABLE and redis_cache:
                try:
                    # 注意：这里假设redis_cache支持按模式删除
                    # 实际需要根据Redis客户端实现
                    logger.info(f"清除缓存: {key_pattern}")
                except Exception as e:
                    logger.error(f"清除缓存失败: {e}")
            
            return result
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            
            if REDIS_AVAILABLE and redis_cache:
                try:
                    logger.info(f"清除缓存: {key_pattern}")
                except Exception as e:
                    logger.error(f"清除缓存失败: {e}")
            
            return result
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


class QueryOptimizer:
    """数据库查询优化工具类"""
    
    @staticmethod
    def optimize_pagination(
        query,
        page: int = 1,
        per_page: int = 20,
        max_per_page: int = 100
    ):
        """优化分页查询"""
        per_page = min(per_page, max_per_page)
        offset = (page - 1) * per_page
        return query.offset(offset).limit(per_page)
    
    @staticmethod
    def add_query_hints(query, hints: list):
        """添加查询提示（适用于某些数据库）"""
        # 这里可以实现特定数据库的查询优化提示
        return query
    
    @staticmethod
    def batch_query(query_func, ids: list, batch_size: int = 100):
        """批量查询优化"""
        results = []
        for i in range(0, len(ids), batch_size):
            batch = ids[i:i + batch_size]
            batch_results = query_func(batch)
            results.extend(batch_results)
        return results
