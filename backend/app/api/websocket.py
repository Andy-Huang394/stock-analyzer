"""
WebSocket管理器 - 实时行情推送
支持多客户端连接、心跳检测、频道订阅、智能推送
"""
import asyncio
import json
import logging
from typing import Dict, Set, Optional, List, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from enum import Enum

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings

try:
    from app.data.redis_cache import redis_cache, REDIS_AVAILABLE
except ImportError:
    REDIS_AVAILABLE = False
    redis_cache = None

logger = logging.getLogger(__name__)


class AlertType(str, Enum):
    """预警类型"""
    PRICE_UP = "price_up"           # 价格上涨
    PRICE_DOWN = "price_down"       # 价格下跌
    LIMIT_UP = "limit_up"           # 涨停
    LIMIT_DOWN = "limit_down"       # 跌停
    VOLUME_SPIKE = "volume_spike"   # 成交量异常
    BREAKOUT = "breakout"           # 突破
    BREAKDOWN = "breakdown"         # 跌破
    MA_CROSS = "ma_cross"           # 均线交叉


@dataclass
class ClientInfo:
    """客户端连接信息"""
    websocket: WebSocket
    client_id: str
    subscribed_symbols: Set[str] = field(default_factory=set)
    subscribed_channels: Set[str] = field(default_factory=set)
    price_alerts: Dict[str, Dict] = field(default_factory=dict)  # 价格预警设置
    connected_at: datetime = field(default_factory=datetime.now)
    last_ping: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)
    is_alive: bool = True
    message_count: int = 0  # 发送消息计数


@dataclass
class PriceAlert:
    """价格预警配置"""
    symbol: str
    alert_type: AlertType
    condition: str  # "above", "below", "change_above", "change_below"
    threshold: float
    triggered: bool = False
    triggered_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)


class WebSocketManager:
    """
    WebSocket连接管理器 - 增强版
    
    功能：
    1. 股票价格实时推送 (每30秒)
    2. 市场概览实时更新 (每60秒)
    3. 价格预警实时通知 (触发时推送)
    4. 智能批量推送优化
    5. 客户端订阅管理
    """

    def __init__(self):
        # 活跃连接 {client_id: ClientInfo}
        self.active_connections: Dict[str, ClientInfo] = {}

        # 股票订阅映射 {symbol: {client_id, ...}}
        self.symbol_subscribers: Dict[str, Set[str]] = {}

        # 频道订阅映射 {channel: {client_id, ...}}
        self.channel_subscribers: Dict[str, Set[str]] = {
            "market": set(),      # 市场概览
            "alerts": set(),      # 价格预警
            "all": set(),         # 全部推送
        }

        # 价格预警列表
        self.price_alerts: List[PriceAlert] = []
        
        # 已触发的预警（去重用）
        self.triggered_alerts: Dict[str, datetime] = {}

        # 消息队列（用于广播）
        self._message_queue: asyncio.Queue = asyncio.Queue()

        # 任务引用
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._broadcast_task: Optional[asyncio.Task] = None
        self._stock_push_task: Optional[asyncio.Task] = None
        self._market_push_task: Optional[asyncio.Task] = None
        self._alert_check_task: Optional[asyncio.Task] = None

        # 运行状态
        self._running = False
        
        # 推送统计
        self._stats = {
            "messages_sent": 0,
            "stock_updates": 0,
            "market_updates": 0,
            "alerts_sent": 0,
            "connections_total": 0
        }

        # 缓存的最新数据
        self._last_market_overview: Optional[dict] = None
        self._last_stock_data: Dict[str, dict] = {}
        self._last_update_time: Optional[datetime] = None

        logger.info("WebSocket管理器初始化完成")

    # ==================== 连接管理 ====================

    async def connect(self, websocket: WebSocket, client_id: Optional[str] = None) -> str:
        """处理新连接"""
        await websocket.accept()

        # 生成客户端ID
        if not client_id:
            client_id = f"client_{id(websocket)}_{datetime.now().timestamp()}"

        client_info = ClientInfo(
            websocket=websocket,
            client_id=client_id
        )

        self.active_connections[client_id] = client_info

        # 默认订阅all频道
        self.channel_subscribers["all"].add(client_id)
        client_info.subscribed_channels.add("all")

        self._stats["connections_total"] += 1

        logger.info(f"WebSocket客户端连接: {client_id}, 当前连接数: {len(self.active_connections)}")

        # 发送欢迎消息
        await self._send_to_client(client_id, {
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now().isoformat(),
            "message": "连接成功",
            "supported_channels": list(self.channel_subscribers.keys()),
            "server_stats": self.get_stats()
        })

        return client_id

    async def disconnect(self, client_id: str):
        """处理断开连接"""
        if client_id not in self.active_connections:
            return

        client_info = self.active_connections[client_id]

        # 从股票订阅中移除
        for symbol in list(client_info.subscribed_symbols):
            if symbol in self.symbol_subscribers:
                self.symbol_subscribers[symbol].discard(client_id)
                # 清理空的订阅
                if not self.symbol_subscribers[symbol]:
                    del self.symbol_subscribers[symbol]

        # 从频道订阅中移除
        for channel in list(client_info.subscribed_channels):
            if channel in self.channel_subscribers:
                self.channel_subscribers[channel].discard(client_id)

        # 移除连接
        del self.active_connections[client_id]

        logger.info(f"WebSocket客户端断开: {client_id}, 当前连接数: {len(self.active_connections)}")

    # ==================== 消息处理 ====================

    async def handle_message(self, client_id: str, message: dict):
        """处理客户端消息"""
        if client_id not in self.active_connections:
            return

        self.active_connections[client_id].last_activity = datetime.now()
        msg_type = message.get("type", "")

        handlers = {
            "subscribe": self._handle_subscribe,
            "unsubscribe": self._handle_unsubscribe,
            "ping": self._handle_ping,
            "get_realtime": self._handle_get_realtime,
            "set_alert": self._handle_set_alert,
            "remove_alert": self._handle_remove_alert,
            "get_alerts": self._handle_get_alerts,
            "batch_subscribe": self._handle_batch_subscribe,
        }

        handler = handlers.get(msg_type)
        if handler:
            await handler(client_id, message)
        else:
            await self._send_to_client(client_id, {
                "type": "error",
                "message": f"未知消息类型: {msg_type}",
                "supported_types": list(handlers.keys())
            })

    async def _handle_subscribe(self, client_id: str, message: dict):
        """处理订阅请求"""
        client_info = self.active_connections[client_id]

        # 订阅股票
        symbols = message.get("symbols", [])
        for symbol in symbols:
            symbol = symbol.upper()
            if symbol not in self.symbol_subscribers:
                self.symbol_subscribers[symbol] = set()
            self.symbol_subscribers[symbol].add(client_id)
            client_info.subscribed_symbols.add(symbol)

        # 订阅频道
        channels = message.get("channels", [])
        for channel in channels:
            if channel in self.channel_subscribers:
                self.channel_subscribers[channel].add(client_id)
                client_info.subscribed_channels.add(channel)

        await self._send_to_client(client_id, {
            "type": "subscribed",
            "symbols": list(client_info.subscribed_symbols),
            "channels": list(client_info.subscribed_channels),
            "timestamp": datetime.now().isoformat()
        })

        logger.debug(f"客户端 {client_id} 订阅: 股票={symbols}, 频道={channels}")

    async def _handle_batch_subscribe(self, client_id: str, message: dict):
        """批量订阅股票（优化版）"""
        client_info = self.active_connections[client_id]
        symbols = message.get("symbols", [])
        
        # 限制最大订阅数量
        max_subscriptions = 100
        if len(symbols) > max_subscriptions:
            symbols = symbols[:max_subscriptions]
            logger.warning(f"客户端 {client_id} 订阅数量超过限制，已截断至 {max_subscriptions}")

        # 批量添加订阅
        added_symbols = []
        for symbol in symbols:
            symbol = symbol.upper()
            if symbol not in client_info.subscribed_symbols:
                if symbol not in self.symbol_subscribers:
                    self.symbol_subscribers[symbol] = set()
                self.symbol_subscribers[symbol].add(client_id)
                client_info.subscribed_symbols.add(symbol)
                added_symbols.append(symbol)

        # 立即推送当前数据
        if added_symbols:
            await self._push_current_stock_data(client_id, added_symbols)

        await self._send_to_client(client_id, {
            "type": "batch_subscribed",
            "added_symbols": added_symbols,
            "total_subscriptions": len(client_info.subscribed_symbols),
            "timestamp": datetime.now().isoformat()
        })

    async def _handle_unsubscribe(self, client_id: str, message: dict):
        """处理取消订阅请求"""
        client_info = self.active_connections[client_id]

        symbols = message.get("symbols", [])
        for symbol in symbols:
            if symbol in self.symbol_subscribers:
                self.symbol_subscribers[symbol].discard(client_id)
            client_info.subscribed_symbols.discard(symbol)

        channels = message.get("channels", [])
        for channel in channels:
            if channel in self.channel_subscribers:
                self.channel_subscribers[channel].discard(client_id)
            client_info.subscribed_channels.discard(channel)

        await self._send_to_client(client_id, {
            "type": "unsubscribed",
            "symbols": symbols,
            "channels": channels,
            "timestamp": datetime.now().isoformat()
        })

    async def _handle_ping(self, client_id: str):
        """处理心跳"""
        if client_id in self.active_connections:
            self.active_connections[client_id].last_ping = datetime.now()
            self.active_connections[client_id].is_alive = True

        await self._send_to_client(client_id, {
            "type": "pong",
            "timestamp": datetime.now().isoformat(),
            "connections": len(self.active_connections)
        })

    async def _handle_get_realtime(self, client_id: str, message: dict):
        """处理获取实时数据请求"""
        from app.services.data_service import data_service

        symbols = message.get("symbols", [])

        # 如果没有指定股票，返回市场概览
        if not symbols:
            overview = data_service.get_market_overview()
            await self._send_to_client(client_id, {
                "type": "market_overview",
                "data": self._serialize_dataclass(overview),
                "timestamp": datetime.now().isoformat()
            })
        else:
            # 返回指定股票的实时数据
            df = data_service.get_realtime_data()
            if not df.empty and symbols:
                data = df[df['symbol'].isin(symbols)].to_dict('records')
            else:
                data = []
            await self._send_to_client(client_id, {
                "type": "realtime_data",
                "data": data,
                "timestamp": datetime.now().isoformat()
            })

    async def _handle_set_alert(self, client_id: str, message: dict):
        """设置价格预警"""
        symbol = message.get("symbol", "").upper()
        condition = message.get("condition", "")  # "above", "below", "change_above", "change_below"
        threshold = message.get("threshold", 0.0)
        alert_type = message.get("alert_type", "price")

        if not symbol or not condition:
            await self._send_to_client(client_id, {
                "type": "error",
                "message": "缺少必要参数: symbol, condition"
            })
            return

        alert = PriceAlert(
            symbol=symbol,
            alert_type=AlertType(alert_type) if alert_type in [e.value for e in AlertType] else AlertType.PRICE_UP,
            condition=condition,
            threshold=threshold
        )

        self.price_alerts.append(alert)
        
        # 同时记录到客户端
        if client_id in self.active_connections:
            self.active_connections[client_id].price_alerts[symbol] = {
                "condition": condition,
                "threshold": threshold,
                "created_at": datetime.now().isoformat()
            }

        await self._send_to_client(client_id, {
            "type": "alert_set",
            "alert": {
                "symbol": symbol,
                "condition": condition,
                "threshold": threshold
            }
        })

    async def _handle_remove_alert(self, client_id: str, message: dict):
        """移除价格预警"""
        symbol = message.get("symbol", "").upper()
        
        # 从全局预警列表移除
        self.price_alerts = [
            alert for alert in self.price_alerts 
            if not (alert.symbol == symbol and alert.triggered == False)
        ]
        
        # 从客户端记录移除
        if client_id in self.active_connections:
            self.active_connections[client_id].price_alerts.pop(symbol, None)

        await self._send_to_client(client_id, {
            "type": "alert_removed",
            "symbol": symbol
        })

    async def _handle_get_alerts(self, client_id: str, message: dict):
        """获取当前预警列表"""
        client_alerts = []
        if client_id in self.active_connections:
            for symbol, config in self.active_connections[client_id].price_alerts.items():
                client_alerts.append({
                    "symbol": symbol,
                    **config
                })

        await self._send_to_client(client_id, {
            "type": "alerts_list",
            "alerts": client_alerts
        })

    # ==================== 推送功能 ====================

    async def _send_to_client(self, client_id: str, message: dict) -> bool:
        """发送消息到指定客户端"""
        if client_id not in self.active_connections:
            return False

        try:
            websocket = self.active_connections[client_id].websocket
            await websocket.send_json(message)
            self.active_connections[client_id].message_count += 1
            self._stats["messages_sent"] += 1
            return True
        except Exception as e:
            logger.error(f"发送消息到 {client_id} 失败: {e}")
            await self.disconnect(client_id)
            return False

    def broadcast(self, message: dict, channel: str = "all"):
        """广播消息到指定频道"""
        self._message_queue.put_nowait({
            "message": message,
            "channel": channel,
            "timestamp": datetime.now()
        })

    async def broadcast_to_symbol(self, symbol: str, message: dict):
        """广播消息到订阅指定股票的客户端"""
        message["symbol"] = symbol
        if "type" not in message:
            message["type"] = "stock_update"

        # 获取订阅该股票的客户端
        target_clients = self.symbol_subscribers.get(symbol, set()).copy()

        if not target_clients:
            return

        # 异步发送
        tasks = [
            self._send_to_client(client_id, message)
            for client_id in target_clients
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        success_count = sum(1 for r in results if r is True)
        
        if success_count > 0:
            self._stats["stock_updates"] += success_count

    async def _push_current_stock_data(self, client_id: str, symbols: List[str]):
        """推送当前股票数据给新订阅的客户端"""
        from app.services.data_service import data_service
        
        df = data_service.get_realtime_data()
        if not df.empty and symbols:
            data = df[df['symbol'].isin(symbols)].to_dict('records')
            if data:
                await self._send_to_client(client_id, {
                    "type": "stock_initial_data",
                    "data": data,
                    "timestamp": datetime.now().isoformat()
                })

    # ==================== 定时推送任务 ====================

    async def _stock_push_worker(self):
        """
        股票价格实时推送工作线程
        每30秒推送一次订阅股票的价格变化
        """
        while self._running:
            try:
                await asyncio.sleep(30)  # 每30秒推送一次
                
                if not self.symbol_subscribers:
                    continue

                from app.services.data_service import data_service
                
                # 获取所有被订阅的股票
                subscribed_symbols = list(self.symbol_subscribers.keys())
                
                if not subscribed_symbols:
                    continue

                # 批量获取实时数据（使用缓存优先）
                df = data_service.get_realtime_data()
                if df.empty:
                    continue

                # 只获取订阅的股票数据
                stock_data = df[df['symbol'].isin(subscribed_symbols)]
                
                # 按股票推送
                for _, row in stock_data.iterrows():
                    symbol = row['symbol']
                    
                    # 检查数据是否有变化
                    last_data = self._last_stock_data.get(symbol)
                    current_data = {
                        "price": float(row['price']),
                        "change_percent": float(row['change_percent']),
                        "volume": int(row['volume']),
                        "amount": float(row.get('amount', 0)),
                        "high": float(row['high']),
                        "low": float(row['low']),
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    # 价格或成交量变化才推送
                    if last_data:
                        price_changed = abs(last_data['price'] - current_data['price']) > 0.001
                        volume_changed = abs(last_data['volume'] - current_data['volume']) > 100
                        
                        if not price_changed and not volume_changed:
                            continue
                    
                    # 更新缓存
                    self._last_stock_data[symbol] = current_data
                    
                    # 推送给订阅者
                    await self.broadcast_to_symbol(symbol, current_data)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"股票价格推送异常: {e}")

    async def _market_push_worker(self):
        """
        市场概览实时更新工作线程
        每60秒推送一次市场整体情况
        """
        while self._running:
            try:
                # 首次立即推送，之后每60秒
                if self._last_market_overview is not None:
                    await asyncio.sleep(60)

                from app.services.data_service import data_service
                
                # 获取市场概览（使用缓存）
                overview = data_service.get_market_overview()
                overview_dict = self._serialize_dataclass(overview)
                
                # 检查是否有显著变化
                if self._last_market_overview:
                    last_avg = self._last_market_overview.get('avg_change', 0)
                    curr_avg = overview_dict.get('avg_change', 0)
                    
                    # 平均涨跌幅变化小于0.01% 且 涨跌家数变化不大，则跳过
                    if abs(last_avg - curr_avg) < 0.01:
                        last_up = self._last_market_overview.get('up_count', 0)
                        curr_up = overview_dict.get('up_count', 0)
                        if abs(last_up - curr_up) < 10:
                            continue

                self._last_market_overview = overview_dict
                self._last_update_time = datetime.now()

                # 构建市场更新消息
                message = {
                    "type": "market_update",
                    "data": overview_dict,
                    "timestamp": datetime.now().isoformat()
                }

                # 推送到market频道
                self.broadcast(message, channel="market")
                
                # 同时推送到all频道
                self.broadcast(message, channel="all")
                
                self._stats["market_updates"] += 1
                
                logger.debug(f"市场概览已推送: 上涨{overview.up_count}, 下跌{overview.down_count}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"市场概览推送异常: {e}")

    async def _alert_check_worker(self):
        """
        价格预警检查工作线程
        每10秒检查一次价格预警条件
        """
        while self._running:
            try:
                await asyncio.sleep(10)  # 每10秒检查一次

                if not self.price_alerts:
                    continue

                from app.services.data_service import data_service
                
                # 获取实时数据
                df = data_service.get_realtime_data()
                if df.empty:
                    continue

                now = datetime.now()
                
                # 检查每个预警
                for alert in self.price_alerts:
                    if alert.triggered:
                        continue
                    
                    # 检查是否已触发过（去重）
                    alert_key = f"{alert.symbol}:{alert.alert_type.value}:{alert.threshold}"
                    if alert_key in self.triggered_alerts:
                        last_triggered = self.triggered_alerts[alert_key]
                        # 同一预警1小时内不重复触发
                        if (now - last_triggered).seconds < 3600:
                            continue

                    # 查找股票数据
                    stock_data = df[df['symbol'] == alert.symbol]
                    if stock_data.empty:
                        continue

                    row = stock_data.iloc[0]
                    triggered = False
                    trigger_data = {}

                    # 检查条件
                    if alert.condition == "above":
                        if row['price'] >= alert.threshold:
                            triggered = True
                            trigger_data = {
                                "current_price": float(row['price']),
                                "threshold": alert.threshold,
                                "message": f"价格涨至 {row['price']:.2f}，超过设定值 {alert.threshold:.2f}"
                            }
                    
                    elif alert.condition == "below":
                        if row['price'] <= alert.threshold:
                            triggered = True
                            trigger_data = {
                                "current_price": float(row['price']),
                                "threshold": alert.threshold,
                                "message": f"价格跌至 {row['price']:.2f}，低于设定值 {alert.threshold:.2f}"
                            }
                    
                    elif alert.condition == "change_above":
                        if row['change_percent'] >= alert.threshold:
                            triggered = True
                            trigger_data = {
                                "change_percent": float(row['change_percent']),
                                "threshold": alert.threshold,
                                "message": f"涨幅达到 {row['change_percent']:+.2f}%，超过设定值 {alert.threshold:.2f}%"
                            }
                    
                    elif alert.condition == "change_below":
                        if row['change_percent'] <= alert.threshold:
                            triggered = True
                            trigger_data = {
                                "change_percent": float(row['change_percent']),
                                "threshold": alert.threshold,
                                "message": f"跌幅达到 {row['change_percent']:+.2f}%，低于设定值 {alert.threshold:.2f}%"
                            }
                    
                    elif alert.condition == "limit_up":
                        if row['change_percent'] >= 9.9:
                            triggered = True
                            trigger_data = {
                                "change_percent": float(row['change_percent']),
                                "message": f"🚀 涨停！涨幅 {row['change_percent']:+.2f}%"
                            }
                    
                    elif alert.condition == "limit_down":
                        if row['change_percent'] <= -9.9:
                            triggered = True
                            trigger_data = {
                                "change_percent": float(row['change_percent']),
                                "message": f"💥 跌停！跌幅 {row['change_percent']:+.2f}%"
                            }

                    if triggered:
                        alert.triggered = True
                        alert.triggered_at = now
                        self.triggered_alerts[alert_key] = now
                        
                        await self.push_price_alert(
                            symbol=alert.symbol,
                            alert_type=alert.alert_type.value,
                            data=trigger_data
                        )

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"预警检查异常: {e}")

    async def _heartbeat_worker(self):
        """心跳检测工作线程"""
        while self._running:
            try:
                await asyncio.sleep(settings.WS_HEARTBEAT_INTERVAL)

                now = datetime.now()
                dead_clients = []

                for client_id, client_info in list(self.active_connections.items()):
                    # 检查最后ping时间
                    if (now - client_info.last_ping).seconds > settings.WS_HEARTBEAT_INTERVAL * 3:
                        logger.warning(f"客户端 {client_id} 心跳超时")
                        dead_clients.append(client_id)
                        continue

                    # 发送ping
                    try:
                        await client_info.websocket.send_json({
                            "type": "ping",
                            "timestamp": now.isoformat()
                        })
                    except Exception:
                        dead_clients.append(client_id)

                # 清理死连接
                for client_id in dead_clients:
                    await self.disconnect(client_id)

            except Exception as e:
                logger.error(f"心跳检测异常: {e}")

    async def _broadcast_worker(self):
        """广播工作线程"""
        while self._running:
            try:
                # 获取消息
                item = await asyncio.wait_for(
                    self._message_queue.get(),
                    timeout=1.0
                )

                message = item["message"]
                channel = item["channel"]

                # 获取目标客户端
                if channel == "all":
                    target_clients = list(self.active_connections.keys())
                else:
                    target_clients = list(self.channel_subscribers.get(channel, set()))

                if not target_clients:
                    continue

                # 批量发送
                tasks = [
                    self._send_to_client(client_id, message)
                    for client_id in target_clients
                ]

                await asyncio.gather(*tasks, return_exceptions=True)

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"广播消息失败: {e}")

    # ==================== 公共推送接口 ====================

    async def push_price_alert(self, symbol: str, alert_type: str, data: dict):
        """
        推送价格预警通知
        
        Args:
            symbol: 股票代码
            alert_type: 预警类型 (limit_up, limit_down, price_up, price_down, volume_spike)
            data: 预警详情数据
        """
        message = {
            "type": "price_alert",
            "alert_type": alert_type,
            "symbol": symbol,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # 推送到alerts频道
        self.broadcast(message, channel="alerts")
        
        # 推送到订阅该股票的客户端
        await self.broadcast_to_symbol(symbol, message)
        
        self._stats["alerts_sent"] += 1
        logger.info(f"价格预警推送: {symbol} - {alert_type}")

    async def push_market_update(self, data: dict):
        """推送市场概览更新"""
        message = {
            "type": "market_update",
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        self.broadcast(message, channel="market")
        self._stats["market_updates"] += 1

    async def push_stock_update(self, symbol: str, data: dict):
        """推送单只股票更新"""
        await self.broadcast_to_symbol(symbol, {
            "price": data.get("price"),
            "change_percent": data.get("change_percent"),
            "volume": data.get("volume"),
            "timestamp": datetime.now().isoformat()
        })

    # ==================== 生命周期管理 ====================

    def start(self):
        """启动WebSocket管理器"""
        if self._running:
            return

        self._running = True

        # 启动心跳任务
        self._heartbeat_task = asyncio.create_task(self._heartbeat_worker())

        # 启动广播任务
        self._broadcast_task = asyncio.create_task(self._broadcast_worker())
        
        # 启动股票推送任务 (每30秒)
        self._stock_push_task = asyncio.create_task(self._stock_push_worker())
        
        # 启动市场推送任务 (每60秒)
        self._market_push_task = asyncio.create_task(self._market_push_worker())
        
        # 启动预警检查任务 (每10秒)
        self._alert_check_task = asyncio.create_task(self._alert_check_worker())

        logger.info("WebSocket管理器已启动")

    def stop(self):
        """停止WebSocket管理器"""
        self._running = False

        tasks = [
            self._heartbeat_task,
            self._broadcast_task,
            self._stock_push_task,
            self._market_push_task,
            self._alert_check_task
        ]

        for task in tasks:
            if task:
                task.cancel()

        logger.info("WebSocket管理器已停止")

    def get_stats(self) -> dict:
        """获取WebSocket统计信息"""
        return {
            "active_connections": len(self.active_connections),
            "symbol_subscriptions": {
                symbol: len(clients)
                for symbol, clients in self.symbol_subscribers.items()
            },
            "channel_subscriptions": {
                channel: len(clients)
                for channel, clients in self.channel_subscribers.items()
            },
            "active_alerts": len([a for a in self.price_alerts if not a.triggered]),
            "triggered_alerts": len(self.triggered_alerts),
            "queue_size": self._message_queue.qsize(),
            "stats": self._stats.copy()
        }

    def _serialize_dataclass(self, obj) -> dict:
        """序列化dataclass对象"""
        if hasattr(obj, '__dataclass_fields__'):
            result = {}
            for field_name in obj.__dataclass_fields__:
                value = getattr(obj, field_name)
                if isinstance(value, datetime):
                    result[field_name] = value.isoformat()
                elif hasattr(value, '__dataclass_fields__'):
                    result[field_name] = self._serialize_dataclass(value)
                elif isinstance(value, list):
                    result[field_name] = [
                        self._serialize_dataclass(item) if hasattr(item, '__dataclass_fields__') else item
                        for item in value
                    ]
                else:
                    result[field_name] = value
            return result
        return obj


# 全局WebSocket管理器实例
ws_manager = WebSocketManager()
