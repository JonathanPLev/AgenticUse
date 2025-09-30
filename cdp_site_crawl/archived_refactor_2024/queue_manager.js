// queue_manager.js
// Simple queue management system for logging data

class QueueManager {
  constructor(maxSize = 10000) {
    this.queue = [];
    this.maxSize = maxSize;
  }

  enqueue(item) {
    this.queue.push(item);
    
    // Keep queue size manageable
    if (this.queue.length > this.maxSize) {
      this.queue.shift(); // Remove oldest item
    }
  }

  dequeue() {
    return this.queue.shift();
  }

  peek() {
    return this.queue[0];
  }

  size() {
    return this.queue.length;
  }

  isEmpty() {
    return this.queue.length === 0;
  }

  clear() {
    this.queue = [];
  }

  // Get all items and clear queue
  drainAll() {
    const items = [...this.queue];
    this.clear();
    return items;
  }

  // Get recent items without clearing
  getRecent(count = 100) {
    return this.queue.slice(-count);
  }
}

module.exports = { QueueManager };
