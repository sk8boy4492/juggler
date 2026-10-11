// IndexedDBの薄いラッパー。Promiseで使えるようにしているだけで、特別なことはしていない。
"use strict";

const DB_NAME = "juggler-predict-db";
const DB_VERSION = 3;

const STORES = {
  stores: "stores", // 店舗
  models: "models", // 機種マスタ(設定差スペック)
  machines: "machines", // 店舗ごとの台番登録
  records: "records", // 日別データ(総回転・BIG・REG・差枚)
  eventRules: "eventRules", // 店舗ごとのイベント日(特定日)登録ルール
  sessionResults: "sessionResults", // 店舗ごとの日別収支(自分の実際の勝敗)
};

function genId() {
  if (window.crypto && window.crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.stores)) {
        db.createObjectStore(STORES.stores, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.models)) {
        db.createObjectStore(STORES.models, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.machines)) {
        const s = db.createObjectStore(STORES.machines, { keyPath: "id" });
        s.createIndex("storeId", "storeId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.records)) {
        const s = db.createObjectStore(STORES.records, { keyPath: "id" });
        s.createIndex("storeId", "storeId", { unique: false });
        s.createIndex("machineId", "machineId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.eventRules)) {
        const s = db.createObjectStore(STORES.eventRules, { keyPath: "id" });
        s.createIndex("storeId", "storeId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.sessionResults)) {
        const s = db.createObjectStore(STORES.sessionResults, { keyPath: "id" });
        s.createIndex("storeId", "storeId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const DB = {
  genId,
  STORES,

  async add(storeName, value) {
    const store = await tx(storeName, "readwrite");
    await wrap(store.add(value));
    return value;
  },

  async put(storeName, value) {
    const store = await tx(storeName, "readwrite");
    await wrap(store.put(value));
    return value;
  },

  async get(storeName, id) {
    const store = await tx(storeName, "readonly");
    return wrap(store.get(id));
  },

  async getAll(storeName) {
    const store = await tx(storeName, "readonly");
    return wrap(store.getAll());
  },

  async getAllByIndex(storeName, indexName, value) {
    const store = await tx(storeName, "readonly");
    return wrap(store.index(indexName).getAll(value));
  },

  async delete(storeName, id) {
    const store = await tx(storeName, "readwrite");
    await wrap(store.delete(id));
  },

  async clearAll(storeName) {
    const store = await tx(storeName, "readwrite");
    await wrap(store.clear());
  },

  async bulkPut(storeName, values) {
    const store = await tx(storeName, "readwrite");
    await Promise.all(values.map((v) => wrap(store.put(v))));
  },
};
