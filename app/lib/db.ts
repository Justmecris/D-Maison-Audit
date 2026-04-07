import path from 'path';
import { supabase } from './supabase';

let db: any = null;
const isCloud = !!supabase;

const getDb = () => {
  if (isCloud) return null;
  if (db) return db;

  const Database = require('better-sqlite3');
  const DB_PATH = path.join(process.cwd(), 'invoices.db');

  try {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        invoice_number TEXT PRIMARY KEY COLLATE NOCASE,
        customer_name TEXT,
        status TEXT DEFAULT 'PENDING',
        scanned_at TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_duplicate INTEGER DEFAULT 0
      )
    `);

    // Migration: Add synced_at if it doesn't exist (for existing databases)
    const tableInfo = db.prepare("PRAGMA table_info(invoices)").all();
    const hasSyncedAt = tableInfo.some((col: any) => col.name === 'synced_at');
    if (!hasSyncedAt) {
      db.exec("ALTER TABLE invoices ADD COLUMN synced_at TEXT DEFAULT CURRENT_TIMESTAMP");
    }

    // Migration: Add COLLATE NOCASE if it's an existing database
    // Note: SQLite doesn't easily allow changing collation on a primary key without recreating the table.
    // However, we can at least ensure all new queries use case-insensitive matching if needed.
    // But for a new setup, the above CREATE TABLE handles it.

    db.exec(`
      CREATE TABLE IF NOT EXISTS jnt_verification_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_name TEXT,
        date_processed TEXT,
        invoice_number TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status INTEGER DEFAULT 0
      )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS payment_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT,
            alt_no TEXT,
            tracking_number TEXT,
            customer_name TEXT,
            profile_name TEXT,
            subtotal DECIMAL(10, 2),
            shipping_cost DECIMAL(10, 2),
            discount DECIMAL(10, 2),
            total DECIMAL(10, 2),
            paid_amount DECIMAL(10, 2),
            payment_provider TEXT,
            account_no TEXT,
            account_name TEXT,
            paid_at TEXT,
            sku TEXT,
            item_name TEXT,
            item_qty INTEGER,
            item_price DECIMAL(10, 2),
            grand_total DECIMAL(10, 2),
            confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            discrepancy TEXT,
            audit_date DATE
        );
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_invoice ON jnt_verification_logs(invoice_number)`);
    return db;
  } catch (err) {
    console.error('Failed to initialize local SQLite database:', err);
    return null;
  }
};

export interface InvoiceRecord {
  invoice_number: string;
  customer_name: string;
  status: string;
  scanned_at?: string;
  synced_at: string;
  is_duplicate: number;
}

export interface JntVerificationLog {
  log_id: number;
  staff_name: string;
  date_processed: string;
  invoice_number: string;
  timestamp: string;
  sync_status: number;
}

export interface PaymentAudit {
  id?: number;
  order_no: string;
  alt_no: string;
  tracking_number: string;
  customer_name: string;
  profile_name: string;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_provider: string;
  account_no: string;
  account_name: string;
  paid_at: string;
  sku: string;
  item_name: string;
  item_qty: number;
  item_price: number;
  grand_total: number;
  confirmed_at?: string;
  discrepancy: string;
  audit_date: string;
}

const ensureDb = () => {
  if (isCloud && supabase) return true;
  const database = getDb();
  if (database) return false;
  throw new Error("Database not initialized.");
};

export const dbService = {
  getAllInvoices: async (): Promise<InvoiceRecord[]> => {
    if (ensureDb()) {
      try {
        const { data, error } = await supabase!.from('invoices').select('*').order('synced_at', { ascending: false });
        if (error) throw error;
        return data as InvoiceRecord[];
      } catch (err) {
        console.warn('Supabase: synced_at column missing or error. Falling back to simple select.');
        const { data, error } = await supabase!.from('invoices').select('*');
        if (error) throw error;
        return data as InvoiceRecord[];
      }
    }
    
    const database = getDb();
    try {
      return database.prepare('SELECT * FROM invoices ORDER BY synced_at DESC').all() as InvoiceRecord[];
    } catch (err) {
      console.warn('SQLite: synced_at column missing. Falling back to simple select.');
      return database.prepare('SELECT * FROM invoices').all() as InvoiceRecord[];
    }
  },

  upsertInvoice: async (invoice: Partial<InvoiceRecord>) => {
    if (!invoice.invoice_number) return;
    
    if (ensureDb()) {
      const { data: existing } = await supabase!.from('invoices').select('*').eq('invoice_number', invoice.invoice_number).single();
      
      const payload: any = {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name || existing?.customer_name,
        synced_at: new Date().toISOString()
      };

      // Only set is_duplicate if it's already in the DB and we aren't just updating it
      // For now, let's just preserve the existing is_duplicate or set it if specifically requested
      payload.is_duplicate = existing ? (existing.is_duplicate || 0) : 0;

      // Never overwrite VERIFIED with PENDING
      if (existing?.status === 'VERIFIED') {
        payload.status = 'VERIFIED';
        payload.scanned_at = existing.scanned_at;
      } else if (invoice.status === 'VERIFIED') {
        payload.status = 'VERIFIED';
        payload.scanned_at = invoice.scanned_at || new Date().toISOString();
      } else {
        payload.status = invoice.status || existing?.status || 'PENDING';
      }

      const { error } = await supabase!.from('invoices').upsert(payload);
      if (error) throw error;
      return;
    }
    const database = getDb();
    // Use LOWER() for case-insensitive lookup
    const existing = database.prepare('SELECT * FROM invoices WHERE LOWER(invoice_number) = LOWER(?)').get(invoice.invoice_number);
    const isDuplicate = existing ? (existing.is_duplicate || 0) : 0;

    const stmt = database.prepare(`
      INSERT INTO invoices (invoice_number, customer_name, status, is_duplicate, synced_at, scanned_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(invoice_number) DO UPDATE SET
        customer_name = COALESCE(excluded.customer_name, invoices.customer_name),
        synced_at = CURRENT_TIMESTAMP,
        scanned_at = CASE
          WHEN excluded.status = 'VERIFIED' THEN COALESCE(excluded.scanned_at, invoices.scanned_at, CURRENT_TIMESTAMP)
          ELSE invoices.scanned_at
        END,
        status = CASE 
          WHEN invoices.status = 'VERIFIED' OR (SELECT status FROM invoices WHERE invoice_number = excluded.invoice_number) = 'VERIFIED' THEN 'VERIFIED'
          ELSE COALESCE(excluded.status, (SELECT status FROM invoices WHERE invoice_number = excluded.invoice_number), 'PENDING')
        END
    `);

    return stmt.run(
      invoice.invoice_number, 
      invoice.customer_name, 
      invoice.status || (existing ? existing.status : 'PENDING'), 
      isDuplicate,
      invoice.scanned_at || null
    );
  },

  updateScanStatus: async (invoiceNumber: string, status: string, scanTime: string) => {
    const fullTimestamp = new Date().toISOString();
    if (ensureDb()) {
      const { error } = await supabase!.from('invoices').update({ 
        status, 
        scanned_at: scanTime || fullTimestamp,
        synced_at: fullTimestamp
      }).eq('invoice_number', invoiceNumber);
      if (error) throw error;
      return;
    }
    // Use LOWER() for case-insensitive update
    const stmt = getDb().prepare(`
      UPDATE invoices 
      SET status = ?, scanned_at = ?, synced_at = CURRENT_TIMESTAMP
      WHERE LOWER(invoice_number) = LOWER(?)
    `);
    return stmt.run(status, scanTime || fullTimestamp, invoiceNumber);
  },

  addVerificationLog: async (log: Omit<JntVerificationLog, 'log_id' | 'timestamp' | 'sync_status'>) => {
    if (ensureDb()) {
      const { error } = await supabase!.from('jnt_verification_logs').insert({
        staff_name: log.staff_name,
        date_processed: log.date_processed,
        invoice_number: log.invoice_number
      });
      if (error) throw error;
      return;
    }
    const stmt = getDb().prepare(`
      INSERT INTO jnt_verification_logs (staff_name, date_processed, invoice_number)
      VALUES (?, ?, ?)
    `);
    return stmt.run(log.staff_name, log.date_processed, log.invoice_number);
  },

  getVerificationLogs: async (): Promise<JntVerificationLog[]> => {
    if (ensureDb()) {
      const { data, error } = await supabase!.from('jnt_verification_logs').select('*').order('timestamp', { ascending: false });
      if (error) throw error;
      return data as JntVerificationLog[];
    }
    return getDb().prepare('SELECT * FROM jnt_verification_logs ORDER BY timestamp DESC').all() as JntVerificationLog[];
  },

  deleteInvoice: async (invoiceNumber: string) => {
    if (ensureDb()) {
      const { error } = await supabase!.from('invoices').delete().eq('invoice_number', invoiceNumber);
      if (error) throw error;
      return;
    }
    const stmt = getDb().prepare('DELETE FROM invoices WHERE invoice_number = ?');
    return stmt.run(invoiceNumber);
  },

  bulkUpsertInvoices: async (invoices: Partial<InvoiceRecord>[]) => {
    if (ensureDb()) {
      const invoiceNumbers = invoices.map(i => i.invoice_number).filter(Boolean) as string[];
      const { data: existing } = await supabase!.from('invoices').select('invoice_number, customer_name, status, scanned_at, is_duplicate').in('invoice_number', invoiceNumbers);
      const existingMap = new Map(existing?.map(e => [e.invoice_number, e]));

      const toUpsert = invoices.map(i => {
        const existingRec = existingMap.get(i.invoice_number!);
        const currentStatus = existingRec?.status;
        const payload: any = {
          invoice_number: i.invoice_number,
          customer_name: i.customer_name || existingRec?.customer_name,
          is_duplicate: existingRec?.is_duplicate || 0,
          synced_at: new Date().toISOString()
        };
        
        // Never overwrite VERIFIED with PENDING
        if (currentStatus === 'VERIFIED' && existingRec) {
          payload.status = 'VERIFIED';
          payload.scanned_at = existingRec.scanned_at;
        } else if (i.status === 'VERIFIED') {
          payload.status = 'VERIFIED';
          payload.scanned_at = i.scanned_at || new Date().toISOString();
        } else {
          payload.status = i.status || currentStatus || 'PENDING';
        }
        
        return payload;
      });

      const { error } = await supabase!.from('invoices').upsert(toUpsert);
      if (error) throw error;
      return;
    }

    const database = getDb();
    const insertStmt = database.prepare(`
      INSERT INTO invoices (invoice_number, customer_name, status, is_duplicate, synced_at, scanned_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(invoice_number) DO UPDATE SET
        customer_name = COALESCE(excluded.customer_name, invoices.customer_name),
        synced_at = CURRENT_TIMESTAMP,
        scanned_at = CASE
          WHEN excluded.status = 'VERIFIED' THEN COALESCE(excluded.scanned_at, invoices.scanned_at, CURRENT_TIMESTAMP)
          ELSE invoices.scanned_at
        END,
        status = CASE 
          WHEN invoices.status = 'VERIFIED' OR (SELECT status FROM invoices WHERE invoice_number = excluded.invoice_number) = 'VERIFIED' THEN 'VERIFIED'
          ELSE COALESCE(excluded.status, (SELECT status FROM invoices WHERE invoice_number = excluded.invoice_number), 'PENDING')
        END
    `);

    // Use LOWER() for case-insensitive lookup
    const selectStmt = database.prepare('SELECT status, customer_name, is_duplicate FROM invoices WHERE LOWER(invoice_number) = LOWER(?)');

    const transaction = database.transaction((items: Partial<InvoiceRecord>[]) => {
      for (const item of items) {
        if (!item.invoice_number) continue;
        const existing = selectStmt.get(item.invoice_number);
        const isDuplicate = existing ? (existing.is_duplicate || 0) : 0;
        insertStmt.run(
          item.invoice_number, 
          item.customer_name || (existing ? existing.customer_name : null), 
          item.status || (existing ? existing.status : 'PENDING'), 
          isDuplicate,
          item.scanned_at || null
        );
      }
    });

    return transaction(invoices);
  },

  bulkAddVerificationLogs: async (logs: Omit<JntVerificationLog, 'log_id' | 'timestamp' | 'sync_status'>[]) => {
    if (ensureDb()) {
      const { error } = await supabase!.from('jnt_verification_logs').insert(logs.map(log => ({
        staff_name: log.staff_name,
        date_processed: log.date_processed,
        invoice_number: log.invoice_number
      })));
      if (error) throw error;
      return;
    }

    const database = getDb();
    const stmt = database.prepare(`
      INSERT INTO jnt_verification_logs (staff_name, date_processed, invoice_number)
      VALUES (?, ?, ?)
    `);

    const transaction = database.transaction((items: any[]) => {
      for (const item of items) {
        stmt.run(item.staff_name, item.date_processed, item.invoice_number);
      }
    });

    return transaction(logs);
  },

  clearAll: async () => {
    if (ensureDb()) {
      await supabase!.from('jnt_verification_logs').delete().neq('log_id', 0);
      await supabase!.from('invoices').delete().neq('invoice_number', '');
      return;
    }
    const database = getDb();
    database.prepare('DELETE FROM jnt_verification_logs').run();
    return database.prepare('DELETE FROM invoices').run();
  },

  getPaymentAudits: async (startDate?: string, endDate?: string): Promise<PaymentAudit[]> => {
    if (ensureDb()) {
      let query = supabase!.from('payment_audits').select('*');
      if (startDate) query = query.gte('audit_date', startDate);
      if (endDate) query = query.lte('audit_date', endDate);
      const { data, error } = await query.order('confirmed_at', { ascending: false });
      if (error) throw error;
      return data as PaymentAudit[];
    }
    
    let sql = 'SELECT * FROM payment_audits';
    const params: any[] = [];
    if (startDate || endDate) {
      sql += ' WHERE';
      if (startDate) {
        sql += ' audit_date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        if (startDate) sql += ' AND';
        sql += ' audit_date <= ?';
        params.push(endDate);
      }
    }
    sql += ' ORDER BY confirmed_at DESC';
    return getDb().prepare(sql).all(...params) as PaymentAudit[];
  },

  addPaymentAudits: async (audits: PaymentAudit[]) => {
    if (ensureDb()) {
      const { error } = await supabase!.from('payment_audits').insert(audits);
      if (error) throw error;
      return;
    }

    const database = getDb();
    const stmt = database.prepare(`
      INSERT INTO payment_audits (
        order_no, alt_no, tracking_number, customer_name, profile_name,
        subtotal, shipping_cost, discount, total, paid_amount,
        payment_provider, account_no, account_name, paid_at,
        sku, item_name, item_qty, item_price, grand_total,
        discrepancy, audit_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = database.transaction((items: PaymentAudit[]) => {
      for (const item of items) {
        stmt.run(
          item.order_no, item.alt_no, item.tracking_number, item.customer_name, item.profile_name,
          item.subtotal, item.shipping_cost, item.discount, item.total, item.paid_amount,
          item.payment_provider, item.account_no, item.account_name, item.paid_at,
          item.sku, item.item_name, item.item_qty, item.item_price, item.grand_total,
          item.discrepancy, item.audit_date
        );
      }
    });

    return insertMany(audits);
  }
};
