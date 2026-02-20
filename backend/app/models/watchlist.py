"""
自选股数据模型
"""
from sqlalchemy import Column, String, Float, DateTime, Integer, create_engine, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

Base = declarative_base()

class WatchlistItem(Base):
    """自选股数据模型"""
    __tablename__ = 'watchlist'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    user_id = Column(String(50), default='default', index=True)  # 预留用户系统
    added_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    alert_price_high = Column(Float, nullable=True)  # 高价预警
    alert_price_low = Column(Float, nullable=True)   # 低价预警
    notes = Column(String(500), nullable=True)       # 备注
    
    def to_dict(self):
        return {
            'id': self.id,
            'symbol': self.symbol,
            'name': self.name,
            'user_id': self.user_id,
            'added_at': self.added_at.isoformat() if self.added_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'alert_price_high': self.alert_price_high,
            'alert_price_low': self.alert_price_low,
            'notes': self.notes
        }


class WatchlistManager:
    """自选股管理器"""
    
    def __init__(self, db_path=None):
        if db_path is None:
            # 使用项目目录下的数据库
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            db_path = os.path.join(base_dir, 'stock_watchlist.db')
        
        self.engine = create_engine(f'sqlite:///{db_path}', echo=False)
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.session = Session()
    
    def add_stock(self, symbol: str, name: str, user_id: str = 'default', 
                  alert_high: float = None, alert_low: float = None, 
                  notes: str = None) -> dict:
        """添加自选股"""
        # 检查是否已存在
        existing = self.session.query(WatchlistItem).filter_by(
            symbol=symbol, user_id=user_id
        ).first()
        
        if existing:
            return {'success': False, 'message': '股票已在自选列表中', 'data': existing.to_dict()}
        
        item = WatchlistItem(
            symbol=symbol,
            name=name,
            user_id=user_id,
            alert_price_high=alert_high,
            alert_price_low=alert_low,
            notes=notes
        )
        
        self.session.add(item)
        self.session.commit()
        
        return {'success': True, 'message': '添加成功', 'data': item.to_dict()}
    
    def remove_stock(self, symbol: str, user_id: str = 'default') -> dict:
        """移除自选股"""
        item = self.session.query(WatchlistItem).filter_by(
            symbol=symbol, user_id=user_id
        ).first()
        
        if not item:
            return {'success': False, 'message': '股票不在自选列表中'}
        
        self.session.delete(item)
        self.session.commit()
        
        return {'success': True, 'message': '移除成功', 'data': {'symbol': symbol}}
    
    def get_watchlist(self, user_id: str = 'default') -> list:
        """获取自选股列表"""
        items = self.session.query(WatchlistItem).filter_by(
            user_id=user_id
        ).order_by(WatchlistItem.added_at.desc()).all()
        
        return [item.to_dict() for item in items]
    
    def get_stock(self, symbol: str, user_id: str = 'default') -> dict:
        """获取单个自选股信息"""
        item = self.session.query(WatchlistItem).filter_by(
            symbol=symbol, user_id=user_id
        ).first()
        
        return item.to_dict() if item else None
    
    def is_in_watchlist(self, symbol: str, user_id: str = 'default') -> bool:
        """检查股票是否在自选列表中"""
        count = self.session.query(WatchlistItem).filter_by(
            symbol=symbol, user_id=user_id
        ).count()
        
        return count > 0
    
    def update_stock(self, symbol: str, user_id: str = 'default',
                     alert_high: float = None, alert_low: float = None,
                     notes: str = None) -> dict:
        """更新自选股信息"""
        item = self.session.query(WatchlistItem).filter_by(
            symbol=symbol, user_id=user_id
        ).first()
        
        if not item:
            return {'success': False, 'message': '股票不在自选列表中'}
        
        if alert_high is not None:
            item.alert_price_high = alert_high
        if alert_low is not None:
            item.alert_price_low = alert_low
        if notes is not None:
            item.notes = notes
        
        item.updated_at = datetime.now()
        self.session.commit()
        
        return {'success': True, 'message': '更新成功', 'data': item.to_dict()}
    
    def import_watchlist(self, stocks: list, user_id: str = 'default') -> dict:
        """批量导入自选股"""
        added = 0
        skipped = 0
        
        for stock in stocks:
            symbol = stock.get('symbol')
            name = stock.get('name', symbol)
            
            if not symbol:
                continue
            
            result = self.add_stock(symbol, name, user_id)
            if result['success']:
                added += 1
            else:
                skipped += 1
        
        return {
            'success': True,
            'message': f'导入完成：新增{added}只，跳过{skipped}只',
            'added': added,
            'skipped': skipped
        }
    
    def clear_watchlist(self, user_id: str = 'default') -> dict:
        """清空自选股列表"""
        count = self.session.query(WatchlistItem).filter_by(
            user_id=user_id
        ).delete()
        self.session.commit()
        
        return {'success': True, 'message': f'已清空{count}只股票'}
    
    def get_statistics(self, user_id: str = 'default') -> dict:
        """获取自选股统计"""
        total = self.session.query(WatchlistItem).filter_by(user_id=user_id).count()
        
        # 获取有预警设置的股票数量
        with_alerts = self.session.query(WatchlistItem).filter_by(
            user_id=user_id
        ).filter(
            (WatchlistItem.alert_price_high != None) | 
            (WatchlistItem.alert_price_low != None)
        ).count()
        
        return {
            'total': total,
            'with_alerts': with_alerts,
            'user_id': user_id
        }


# 全局实例
watchlist_manager = WatchlistManager()
