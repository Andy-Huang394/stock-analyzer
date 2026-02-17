"""
Stock Analyzer - A股量化分析平台主程序
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
import uvicorn

from app.core.config import settings
from app.api.routes import router
from app.api.websocket import ws_manager
from app.services.data_service import data_service


# 定时任务调度器
scheduler = AsyncIOScheduler()


def scheduled_analysis():
    """定时分析任务"""
    print(f"[{datetime.now()}] 执行定时全市场分析...")
    try:
        results = data_service.analyze_all_stocks(max_stocks=200)
        print(f"分析完成，共 {len(results)} 只股票")
        
        # 打印前5名
        top5 = results[:5]
        print("\n🏆 今日TOP 5:")
        for r in top5:
            print(f"  {r.symbol} {r.name}: 评分{r.total_score:.1f}, 涨幅{r.change_percent:+.2f}%, 上涨概率{r.up_probability*100:.1f}%")
        
        # WebSocket推送Top10更新
        if results:
            asyncio.create_task(ws_manager.push_market_update({
                "top10": [
                    {
                        "symbol": r.symbol,
                        "name": r.name,
                        "score": r.total_score,
                        "change": r.change_percent,
                        "probability": r.up_probability
                    }
                    for r in results[:10]
                ],
                "timestamp": datetime.now().isoformat()
            }))
        
    except Exception as e:
        print(f"定时分析失败: {e}")


def scheduled_data_update():
    """定时数据更新任务"""
    print(f"[{datetime.now()}] 更新实时数据...")
    try:
        data_service.update_realtime_data()
        
        # WebSocket推送市场概览更新
        try:
            overview = data_service.get_market_overview()
            asyncio.create_task(ws_manager.push_market_update({
                "market_overview": {
                    "total_stocks": overview.total_stocks,
                    "up_count": overview.up_count,
                    "down_count": overview.down_count,
                    "avg_change": overview.avg_change,
                    "volume": overview.volume
                },
                "timestamp": datetime.now().isoformat()
            }))
        except Exception as e:
            print(f"推送市场更新失败: {e}")
            
    except Exception as e:
        print(f"数据更新失败: {e}")


def scheduled_price_alerts():
    """定时价格预警检查"""
    try:
        df = data_service.get_realtime_data()
        if df.empty:
            return
        
        # 检查涨跌停
        limit_up = df[df['change_percent'] >= 9.9]
        limit_down = df[df['change_percent'] <= -9.9]
        
        # 推送涨停预警
        for _, row in limit_up.head(5).iterrows():
            asyncio.create_task(ws_manager.push_price_alert(
                symbol=row['symbol'],
                alert_type="limit_up",
                data={
                    "name": row['name'],
                    "price": float(row['price']),
                    "change_percent": float(row['change_percent'])
                }
            ))
        
        # 推送跌停预警
        for _, row in limit_down.head(5).iterrows():
            asyncio.create_task(ws_manager.push_price_alert(
                symbol=row['symbol'],
                alert_type="limit_down",
                data={
                    "name": row['name'],
                    "price": float(row['price']),
                    "change_percent": float(row['change_percent'])
                }
            ))
            
    except Exception as e:
        print(f"价格预警检查失败: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    print("🚀 Stock Analyzer 启动中...")
    
    # 初始化WebSocket管理器
    ws_manager.start()
    print("✅ WebSocket管理器已启动")
    
    # 初始化数据（使用模拟数据快速启动）
    print("正在初始化数据...")
    # 直接使用模拟数据避免启动时卡住
    data_service._realtime_data = data_service._get_mock_data()
    data_service._last_update = datetime.now()
    print(f"✅ 已加载 {len(data_service._realtime_data)} 只模拟股票数据")
    
    # 启动定时任务
    print("启动定时任务...")
    
    # 每60秒更新一次实时数据
    scheduler.add_job(
        scheduled_data_update,
        trigger=IntervalTrigger(seconds=60),
        id='data_update',
        replace_existing=True
    )
    
    # 每5分钟进行一次全市场分析
    scheduler.add_job(
        scheduled_analysis,
        trigger=IntervalTrigger(minutes=5),
        id='market_analysis',
        replace_existing=True
    )
    
    # 每30秒检查一次价格预警
    scheduler.add_job(
        scheduled_price_alerts,
        trigger=IntervalTrigger(seconds=30),
        id='price_alerts',
        replace_existing=True
    )
    
    scheduler.start()
    
    print("✅ 服务启动完成！")
    print(f"📊 API文档: http://{settings.HOST}:{settings.PORT}/docs")
    print(f"🔌 WebSocket: ws://{settings.HOST}:{settings.PORT}/ws")
    
    yield
    
    # 关闭时执行
    print("正在关闭服务...")
    ws_manager.stop()
    scheduler.shutdown()
    print("✅ 服务已关闭")


# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="A股量化分析平台 - 技术分析、策略回测、智能选股",
    lifespan=lifespan
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)

# 注册路由
app.include_router(router, prefix="/api/v1")


# WebSocket端点
@app.websocket("/ws")
async def websocket_endpoint(websocket):
    """WebSocket连接端点"""
    client_id = None
    try:
        client_id = await ws_manager.connect(websocket)
        
        # 持续接收消息
        while True:
            try:
                message = await websocket.receive_json()
                await ws_manager.handle_message(client_id, message)
            except Exception as e:
                print(f"WebSocket消息处理错误: {e}")
                break
                
    except WebSocketDisconnect:
        print(f"WebSocket断开: {client_id}")
    except Exception as e:
        print(f"WebSocket错误: {e}")
    finally:
        if client_id:
            await ws_manager.disconnect(client_id)


@app.get("/health")
async def health_check():
    """健康检查"""
    # 获取缓存状态
    from app.data.cache import data_cache
    cache_stats = data_cache.get_cache_stats()
    
    # 获取WebSocket状态
    ws_stats = ws_manager.get_stats()
    
    return {
        "status": "healthy",
        "timestamp": datetime.now(),
        "version": settings.APP_VERSION,
        "cache": cache_stats,
        "websocket": ws_stats
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level="info",
        access_log=True
    )
