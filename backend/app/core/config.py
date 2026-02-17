"""
核心配置模块
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置"""
    # 应用配置
    APP_NAME: str = "Stock Analyzer"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # 数据库配置
    DATABASE_URL: str = "sqlite:///./stock_analyzer.db"
    
    # Redis配置
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    REDIS_ENABLED: bool = True  # 是否启用Redis缓存
    REDIS_CACHE_TTL: int = 3600  # Redis缓存默认过期时间(秒)
    
    # 数据更新配置
    DATA_UPDATE_INTERVAL: int = 60  # 秒，实时数据更新间隔
    
    # 股票列表缓存时间（分钟）
    STOCK_LIST_CACHE_MINUTES: int = 60
    
    # 默认回测参数
    DEFAULT_BACKTEST_DAYS: int = 60
    
    # API限流配置
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: int = 100  # 每分钟默认请求次数
    
    # WebSocket配置
    WS_HEARTBEAT_INTERVAL: int = 30  # 心跳间隔(秒)
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
