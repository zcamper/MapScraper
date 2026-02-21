import { Agent } from 'https';
import https from 'https';
import http from 'http';

/**
 * Manages rotating proxy servers for web requests
 */
export class ProxyManager {
  constructor(proxyList = []) {
    this.proxyList = proxyList.filter(p => p && p.trim());
    this.currentIndex = 0;
    this.enabled = this.proxyList.length > 0;
  }

  /**
   * Get next proxy in rotation
   */
  getNextProxy() {
    if (!this.enabled) return null;

    const proxy = this.proxyList[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxyList.length;
    return proxy;
  }

  /**
   * Get current proxy
   */
  getCurrentProxy() {
    if (!this.enabled) return null;
    return this.proxyList[this.currentIndex];
  }

  /**
   * Convert proxy URL to Playwright format
   */
  parseProxy(proxyUrl) {
    try {
      const url = new URL(proxyUrl.startsWith('http') ? proxyUrl : `http://${proxyUrl}`);
      return {
        server: `${url.protocol}//${url.hostname}:${url.port || 8080}`,
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch (error) {
      console.error(`Invalid proxy URL: ${proxyUrl}`, error.message);
      return null;
    }
  }

  /**
   * Format proxy for Playwright browser context
   */
  getPlaywrightProxy(proxyUrl) {
    if (!proxyUrl) return null;
    const parsed = this.parseProxy(proxyUrl);
    if (!parsed) return null;

    return {
      server: parsed.server,
      ...(parsed.username && { username: parsed.username }),
      ...(parsed.password && { password: parsed.password }),
    };
  }

  /**
   * Add new proxy to list
   */
  addProxy(proxyUrl) {
    if (!this.proxyList.includes(proxyUrl)) {
      this.proxyList.push(proxyUrl);
      this.enabled = this.proxyList.length > 0;
    }
  }

  /**
   * Remove proxy from list
   */
  removeProxy(proxyUrl) {
    this.proxyList = this.proxyList.filter(p => p !== proxyUrl);
    this.enabled = this.proxyList.length > 0;
    if (this.currentIndex >= this.proxyList.length) {
      this.currentIndex = 0;
    }
  }

  /**
   * Test proxy connectivity by making a simple HTTPS request
   */
  async testProxy(proxyUrl) {
    const parsed = this.parseProxy(proxyUrl);
    if (!parsed) return false;

    return new Promise((resolve) => {
      const proxyUrlObj = new URL(parsed.server);
      const options = {
        hostname: proxyUrlObj.hostname,
        port: proxyUrlObj.port || 8080,
        path: 'https://httpbin.org/ip',
        method: 'CONNECT',
        headers: {
          Host: 'httpbin.org:443',
        },
        timeout: 10000,
      };

      if (parsed.username && parsed.password) {
        const auth = Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64');
        options.headers['Proxy-Authorization'] = `Basic ${auth}`;
      }

      const req = http.request(options);

      req.on('connect', (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
        req.destroy();
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Get valid proxies from current list
   */
  async getValidProxies() {
    console.log(`Testing ${this.proxyList.length} proxies...`);
    const validProxies = [];

    for (const proxy of this.proxyList) {
      const isValid = await this.testProxy(proxy);
      if (isValid) {
        validProxies.push(proxy);
        console.log(`  Valid: ${proxy}`);
      } else {
        console.log(`  Invalid: ${proxy}`);
      }
    }

    console.log(`${validProxies.length}/${this.proxyList.length} proxies are valid`);
    return validProxies;
  }

  /**
   * Get proxy count
   */
  get count() {
    return this.proxyList.length;
  }
}

export default ProxyManager;
