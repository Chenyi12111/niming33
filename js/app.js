// LeanCloud 配置
const APP_ID = 'wanb2m8WLDHjpn2f6i8RY70n-MdYXbMMI';
const APP_KEY = '9Aeas2PrP2Vsl1zeiZ5pXx0y';
const SERVER_URL = 'https://wanb2m8w.api.lncldglobal.com';

// 初始化 LeanCloud
try {
    AV.init({
        appId: APP_ID,
        appKey: APP_KEY,
        serverURL: SERVER_URL
    });
    console.log('LeanCloud 初始化成功');
} catch (error) {
    console.error('LeanCloud 初始化失败:', error);
}

// 检查 LeanCloud 连接
async function checkLeanCloudConnection() {
    try {
        const TestObject = AV.Object.extend('Test');
        const testObject = new TestObject();
        testObject.set('test', 'connection_test');
        await testObject.save();
        await testObject.destroy();
        console.log('LeanCloud 连接测试成功');
        return true;
    } catch (error) {
        console.error('LeanCloud 连接测试失败:', error);
        return false;
    }
}

// 用户身份管理
class IdentityManager {
    constructor() {
        this.identities = new Map();
    }

    async getIdentity(roomId, userId) {
        const key = `${roomId}_${userId}`;
        
        if (this.identities.has(key)) {
            return this.identities.get(key);
        }
        
        return await this.generateIdentityFromLeanCloud(roomId, userId);
    }

    async generateIdentityFromLeanCloud(roomId, userId) {
        try {
            // 检查 LeanCloud 连接
            const isConnected = await checkLeanCloudConnection();
            if (!isConnected) {
                throw new Error('LeanCloud 连接失败');
            }

            // 使用 LeanCloud 的计数器功能
            const RoomCounter = AV.Object.extend('RoomCounter');
            const query = new AV.Query('RoomCounter');
            query.equalTo('roomId', roomId);
            
            let counter = await query.first();
            if (!counter) {
                counter = new RoomCounter();
                counter.set('roomId', roomId);
                counter.set('count', 0);
                await counter.save();
            }
            
            // 原子增加计数器
            counter.increment('count', 1);
            await counter.save();
            
            const userCount = counter.get('count');
            const userNumber = userCount.toString().padStart(2, '0');
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const avatar = gender === 'male' ? '🔵🐑' : '🌸🐑';
            const color = gender === 'male' ? '#1890FF' : '#FF69B4';
            
            const identity = {
                name: userNumber,
                avatar: avatar,
                gender: gender,
                color: color,
                userId: userId
            };
            
            this.identities.set(`${roomId}_${userId}`, identity);
            console.log('生成用户身份:', identity);
            return identity;
        } catch (error) {
            console.error('生成身份失败，使用备用身份:', error);
            return this.generateFallbackIdentity();
        }
    }

    generateFallbackIdentity() {
        const userNumber = Math.floor(Math.random() * 99 + 1).toString().padStart(2, '0');
        const gender = Math.random() > 0.5 ? 'male' : 'female';
        const avatar = gender === 'male' ? '🔵🐑' : '🌸🐑';
        const color = gender === 'male' ? '#1890FF' : '#FF69B4';
        
        const identity = {
            name: userNumber,
            avatar: avatar,
            gender: gender,
            color: color,
            userId: 'fallback_' + Date.now()
        };
        
        console.log('生成备用身份:', identity);
        return identity;
    }
}

// 聊天管理器 - 使用 LeanCloud 实时通信
class ChatManager {
    constructor() {
        this.identityManager = new IdentityManager();
        this.currentRoom = null;
        this.userId = this.generateUserId();
        this.lastActivity = new Date();
        this.messageQuery = null;
        this.subscription = null;
        this.isConnected = false;
        
        // 检查连接状态
        this.checkConnection();
    }

    async checkConnection() {
        this.isConnected = await checkLeanCloudConnection();
        console.log('聊天管理器连接状态:', this.isConnected);
        return this.isConnected;
    }

    generateUserId() {
        let userId = localStorage.getItem('anonymous_chat_userId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('anonymous_chat_userId', userId);
        }
        return userId;
    }

    // 加入聊天室
    async joinRoom(roomId, roomName) {
        console.log('加入房间:', roomId, roomName);
        
        if (!this.isConnected) {
            console.warn('LeanCloud 未连接，使用本地模式');
            this.setupLocalRoom(roomId, roomName);
            return this.identityManager.generateFallbackIdentity();
        }

        try {
            this.currentRoom = roomId;
            const identity = await this.identityManager.getIdentity(roomId, this.userId);
            
            // 保存房间信息
            sessionStorage.setItem('currentRoom', roomId);
            sessionStorage.setItem('roomName', roomName);
            
            // 设置消息监听
            await this.setupMessageListener(roomId);
            
            // 发送加入通知
            await this.sendSystemMessage(`${identity.avatar} 用户 ${identity.name} 加入了聊天室`);
            
            // 更新活动时间
            this.updateActivity();
            
            console.log('成功加入房间:', roomId);
            return identity;
        } catch (error) {
            console.error('加入房间失败:', error);
            this.setupLocalRoom(roomId, roomName);
            return this.identityManager.generateFallbackIdentity();
        }
    }

    // 本地模式设置（当 LeanCloud 不可用时）
    setupLocalRoom(roomId, roomName) {
        this.currentRoom = roomId;
        sessionStorage.setItem('currentRoom', roomId);
        sessionStorage.setItem('roomName', roomName);
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            // 保留现有的欢迎消息，只添加错误提示
            const errorMessage = document.createElement('div');
            errorMessage.className = 'system-message error';
            errorMessage.textContent = '⚠️ LeanCloud 连接失败，使用本地模式（消息不会保存）';
            messagesContainer.appendChild(errorMessage);
        }
    }

    // 设置消息监听器 - 修复实时消息接收
    async setupMessageListener(roomId) {
        if (!this.isConnected) {
            console.warn('LeanCloud 未连接，跳过消息监听设置');
            return;
        }

        try {
            console.log('开始设置消息监听器，房间:', roomId);
            
            // 创建消息查询
            const Message = AV.Object.extend('Message');
            this.messageQuery = new AV.Query('Message');
            this.messageQuery.equalTo('roomId', roomId);
            this.messageQuery.addDescending('createdAt');
            this.messageQuery.limit(50);
            
            // 先加载历史消息
            const historyMessages = await this.messageQuery.find();
            const messagesContainer = document.getElementById('messagesContainer');
            
            if (messagesContainer) {
                // 移除加载中的消息（如果存在）
                const loadingMessages = messagesContainer.querySelectorAll('.system-message');
                loadingMessages.forEach(msg => {
                    if (msg.textContent.includes('加载中')) {
                        msg.remove();
                    }
                });
                
                // 显示历史消息（按时间正序）
                if (historyMessages.length > 0) {
                    console.log('加载历史消息:', historyMessages.length, '条');
                    historyMessages.reverse().forEach(message => {
                        this.displayMessage(message.toJSON());
                    });
                    
                    this.displaySystemMessage(`已加载 ${historyMessages.length} 条历史消息`);
                } else {
                    this.displaySystemMessage('这是新聊天室，还没有历史消息');
                }
                
                // 自动滚动到底部
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
            // 实时监听新消息 - 使用 LiveQuery
            console.log('开始订阅实时消息...');
            this.subscription = await this.messageQuery.subscribe();
            
            this.subscription.on('create', (message) => {
                console.log('收到新实时消息:', message.toJSON());
                this.displayMessage(message.toJSON());
                this.updateActivity();
            });
            
            this.subscription.on('update', (message) => {
                console.log('消息更新:', message.toJSON());
            });
            
            this.subscription.on('delete', (message) => {
                console.log('消息删除:', message.toJSON());
            });
            
            console.log('消息监听器设置成功，正在监听新消息...');
            
        } catch (error) {
            console.error('设置消息监听失败:', error);
            this.isConnected = false;
            
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                this.displaySystemMessage('❌ 实时消息监听失败，请刷新页面重试');
            }
        }
    }

    // 发送消息
    async sendMessage(content) {
        if (!content.trim()) return;
        
        if (!this.currentRoom) {
            alert('请先选择聊天室');
            return;
        }
        
        console.log('发送消息:', content, '到房间:', this.currentRoom);
        
        // 如果 LeanCloud 不可用，使用本地显示
        if (!this.isConnected) {
            this.displayLocalMessage(content);
            return;
        }
        
        try {
            const identity = await this.identityManager.getIdentity(this.currentRoom, this.userId);
            
            // 创建 Message 对象
            const Message = AV.Object.extend('Message');
            const message = new Message();
            
            message.set('type', 'message');
            message.set('roomId', this.currentRoom);
            message.set('user', identity);
            message.set('content', content);
            message.set('timestamp', new Date());
            
            await message.save();
            console.log('消息发送成功:', content);
            
            // 更新活动时间
            this.updateActivity();
        } catch (error) {
            console.error('发送消息失败:', error);
            // 失败时也本地显示
            this.displayLocalMessage(content);
        }
    }

    // 本地显示消息（当 LeanCloud 不可用时）
    displayLocalMessage(content) {
        const identity = this.identityManager.generateFallbackIdentity();
        const messagesContainer = document.getElementById('messagesContainer');
        
        if (messagesContainer) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message own';
            messageElement.innerHTML = `
                <div class="message-avatar">${identity.avatar}</div>
                <div class="message-content">
                    <div class="message-user" style="color: ${identity.color}">
                        ${identity.name} ${identity.avatar} (本地)
                    </div>
                    <div class="message-bubble">${content}</div>
                </div>
            `;
            
            messagesContainer.appendChild(messageElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // 发送系统消息
    async sendSystemMessage(content) {
        if (!this.currentRoom || !this.isConnected) return;
        
        try {
            const Message = AV.Object.extend('Message');
            const message = new Message();
            
            message.set('type', 'system');
            message.set('roomId', this.currentRoom);
            message.set('content', content);
            message.set('timestamp', new Date());
            
            await message.save();
        } catch (error) {
            console.error('发送系统消息失败:', error);
        }
    }

    // 显示消息
    displayMessage(messageData) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) {
            console.warn('消息容器未找到');
            return;
        }
        
        console.log('显示消息:', messageData);
        
        if (messageData.type === 'system') {
            this.displaySystemMessage(messageData.content);
        } else {
            this.displayUserMessage(messageData);
        }
        
        // 自动滚动到底部
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }

    // 显示用户消息 - 修复显示逻辑
    displayUserMessage(messageData) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        console.log('显示用户消息:', messageData);
        
        // 检查是否是自己的消息
        const isOwnMessage = messageData.user && messageData.user.userId === this.userId;
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwnMessage ? 'own' : ''}`;
        
        // 确保用户信息存在
        const userInfo = messageData.user || {
            name: '00',
            avatar: '🔵🐑',
            color: '#1890FF',
            userId: 'unknown'
        };
        
        messageElement.innerHTML = `
            <div class="message-avatar">${userInfo.avatar}</div>
            <div class="message-content">
                <div class="message-user" style="color: ${userInfo.color}">
                    ${userInfo.name} ${userInfo.avatar}
                </div>
                <div class="message-bubble">${messageData.content}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        console.log('用户消息已添加到DOM');
    }

    // 显示系统消息
    displaySystemMessage(content) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.textContent = content;
        messagesContainer.appendChild(messageElement);
    }

    // 更新活动时间
    updateActivity() {
        this.lastActivity = new Date();
        
        // 更新状态显示
        const statusElement = document.getElementById('roomStatus');
        if (statusElement) {
            const statusText = this.isConnected ? '已连接' : '本地模式';
            statusElement.textContent = statusText;
            statusElement.style.color = this.isConnected ? '#52c41a' : '#faad14';
        }
        
        // 重置清理计时器
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
        }
        
        // 设置自动清理（10分钟无人说话）
        this.cleanupTimer = setTimeout(() => {
            this.cleanupRoom();
        }, 10 * 60 * 1000);
    }

    // 清理房间
    async cleanupRoom() {
        if (!this.currentRoom || !this.isConnected) return;
        
        try {
            // 从 LeanCloud 删除所有消息
            const Message = AV.Object.extend('Message');
            const query = new AV.Query('Message');
            query.equalTo('roomId', this.currentRoom);
            
            const messages = await query.find();
            await AV.Object.destroyAll(messages);
            
            // 显示清理消息
            this.displaySystemMessage('🗑️ 聊天室因10分钟无活动已自动清理');
            
            // 重置状态
            const statusElement = document.getElementById('roomStatus');
            if (statusElement) {
                statusElement.textContent = '已清理';
                statusElement.style.color = '#ff4d4f';
            }
        } catch (error) {
            console.error('清理房间失败:', error);
        }
    }

    // 离开房间
    leaveRoom() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            console.log('取消消息订阅');
        }
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
        }
        this.currentRoom = null;
    }
}

// 全局聊天管理器
const chatManager = new ChatManager();

// 页面功能 - 聊天室列表
function initRoomList() {
    const roomList = document.getElementById('roomList');
    if (!roomList) return;
    
    const rooms = [
        { id: 'general', name: '普通聊天室', icon: '🏠', desc: '随便聊聊' },
        { id: 'game', name: '游戏交流室', icon: '🎮', desc: '分享游戏心得' },
        { id: 'emotion', name: '情感树洞室', icon: '💬', desc: '倾诉心声' },
        { id: 'music', name: '音乐分享室', icon: '🎵', desc: '分享好音乐' }
    ];
    
    roomList.innerHTML = '';
    
    rooms.forEach(room => {
        const roomCard = document.createElement('div');
        roomCard.className = 'room-card';
        roomCard.innerHTML = `
            <div class="room-icon">${room.icon}</div>
            <div class="room-info">
                <h3>${room.name}</h3>
                <p>${room.desc} · <span class="online-count">0</span>人在线 · <span class="status-text">活跃中</span></p>
            </div>
        `;
        roomCard.onclick = () => enterRoom(room.id, room.name);
        roomList.appendChild(roomCard);
    });
}

// 进入聊天室
async function enterRoom(roomId, roomName) {
    console.log('进入房间:', roomId, roomName);
    
    // 同时使用URL参数和sessionStorage
    sessionStorage.setItem('currentRoom', roomId);
    sessionStorage.setItem('roomName', roomName);
    
    // 跳转到聊天页面，携带URL参数
    window.location.href = `chat.html?roomId=${encodeURIComponent(roomId)}&roomName=${encodeURIComponent(roomName)}`;
}

// 创建新聊天室
function createNewRoom() {
    const roomId = 'room_' + Date.now();
    const roomName = '新聊天室' + Math.random().toString(36).substr(2, 4);
    enterRoom(roomId, roomName);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.endsWith('index.html') || 
        window.location.pathname === '/' || 
        window.location.pathname.endsWith('/')) {
        initRoomList();
        
        // 检查连接状态并显示提示
        setTimeout(() => {
            if (!chatManager.isConnected) {
                const header = document.querySelector('.header');
                if (header) {
                    const warning = document.createElement('div');
                    warning.style.background = '#fff3cd';
                    warning.style.color = '#856404';
                    warning.style.padding = '10px';
                    warning.style.borderRadius = '5px';
                    warning.style.marginTop = '10px';
                    warning.style.fontSize = '14px';
                    warning.innerHTML = '⚠️ LeanCloud 连接失败，将使用本地模式';
                    header.appendChild(warning);
                }
            }
        }, 1000);
    }
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', function() {
    chatManager.leaveRoom();
});