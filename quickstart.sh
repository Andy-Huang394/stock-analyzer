#!/bin/bash
# Stock Analyzer - 简化启动脚本
# 适用于已配置好依赖的环境

export PATH="$HOME/miniconda3/bin:$PATH"

echo "🚀 Stock Analyzer 快速启动"
echo ""

# 检查依赖
check_module() {
    python3 -c "import $1" 2>/dev/null && echo "✅ $1" || echo "❌ $1 缺失"
}

echo "检查核心依赖..."
check_module fastapi
check_module uvicorn
check_module pandas
check_module akshare
check_module apscheduler

echo ""
echo "如需安装缺失依赖，运行:"
echo "  export PATH=\"\$HOME/miniconda3/bin:\$PATH\""
echo "  pip install --user fastapi uvicorn pandas numpy akshare apscheduler sqlalchemy pydantic-settings"
echo ""
echo "启动服务:"
echo ""
echo "【先启动后端】"
echo "  cd $(pwd)/backend"
echo "  export PATH=\"\$HOME/miniconda3/bin:\$PATH\""
echo "  python3 main.py"
echo ""
echo "【再开新终端启动前端】"  
echo "  cd $(pwd)/frontend"
echo "  npm install"
echo "  npm start"
