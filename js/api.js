window.API = {
  baseURL: '/api',
  getToken() { return sessionStorage.getItem('qj_token'); },
  setToken(t) { if (t) sessionStorage.setItem('qj_token', t); else sessionStorage.removeItem('qj_token'); },

    async aiMap(type, columns, sampleRows) {
    return this.request('/ai-map', {
      method: 'POST',
      body: JSON.stringify({ type, columns, sampleRows })
    });
  },
  
  async request(path, options={}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers||{}),
      ...(token ? {'Authorization':`Bearer ${token}`} : {})
    };
    try {
      const res = await fetch(`${this.baseURL}${path}`, { ...options, headers });
      if (res.status === 401) {
        this.setToken(null);
        sessionStorage.removeItem('qj_user');
        toast('세션 만료. 다시 로그인해주세요.', 'error');
        setTimeout(()=>location.reload(), 1500);
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (e) {
      console.error(`[API ${path}]`, e);
      throw e;
    }
  },

  // 🆕 인증 없이 공개 GET (로그인 화면 커스터마이징용)
  async publicGet(collection) {
    try {
      const res = await fetch(`${this.baseURL}/data?collection=${collection}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn(`[API public ${collection}]`, e);
      return null;
    }
  },

  async login(id, pw) {
    const res = await this.request('/auth', { method:'POST', body: JSON.stringify({id, pw}) });
    this.setToken(res.token);
    return res.user;
  },
  logout() { this.setToken(null); },
  async list(c) { return this.request(`/data?collection=${c}`); },
  async create(c, d) { return this.request(`/data?collection=${c}`, { method:'POST', body: JSON.stringify(d) }); },
  async update(c, id, d) { return this.request(`/data?collection=${c}&id=${id}`, { method:'PUT', body: JSON.stringify(d) }); },
  async delete(c, id) { return this.request(`/data?collection=${c}&id=${id}`, { method:'DELETE' }); },
  async setAll(c, d) { return this.request(`/data?collection=${c}&bulk=1`, { method:'PUT', body: JSON.stringify({ data: d }) }); }
  
};