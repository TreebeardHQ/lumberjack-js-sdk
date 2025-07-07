import { MockExporter } from './__mocks__/mock-exporter.js';
import type { EnrichedLogEntry, EnrichedRegisteredObject } from './exporter.js';

describe('Exporter Interface', () => {
  let mockExporter: MockExporter;
  
  beforeEach(() => {
    mockExporter = new MockExporter();
  });
  
  describe('exportLogs', () => {
    it('should export logs successfully', async () => {
      const logs: EnrichedLogEntry[] = [
        {
          message: 'Test log',
          level: 'info',
          timestamp: Date.now(),
          msg: 'Test log',
          lvl: 'info',
          ts: Date.now(),
          project_name: 'test-project',
          sdk_version: '2',
          commit_sha: 'abc123'
        }
      ];
      
      const result = await mockExporter.exportLogs(logs);
      
      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(1);
      expect(mockExporter.exportedLogs).toHaveLength(1);
      expect(mockExporter.exportedLogs[0]).toMatchObject(logs[0]);
    });
    
    it('should handle export failures', async () => {
      const logs: EnrichedLogEntry[] = [
        {
          message: 'Test log',
          level: 'info',
          timestamp: Date.now(),
          msg: 'Test log',
          lvl: 'info',
          ts: Date.now(),
          project_name: 'test-project',
          sdk_version: '2',
          commit_sha: 'abc123'
        }
      ];
      
      mockExporter.shouldSucceed = false;
      mockExporter.errorMessage = 'Export failed';
      
      const result = await mockExporter.exportLogs(logs);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Export failed');
      expect(result.itemsExported).toBe(0);
      expect(mockExporter.exportedLogs).toHaveLength(0);
    });
    
    it('should handle empty logs array', async () => {
      const result = await mockExporter.exportLogs([]);
      
      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(0);
      expect(mockExporter.exportedLogs).toHaveLength(0);
    });
  });
  
  describe('exportObjects', () => {
    it('should export objects successfully', async () => {
      const objects: EnrichedRegisteredObject[] = [
        {
          name: 'test-object',
          id: 'obj-123',
          fields: { key: 'value' },
          project_name: 'test-project',
          sdk_version: '2',
          commit_sha: 'abc123'
        }
      ];
      
      const result = await mockExporter.exportObjects(objects);
      
      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(1);
      expect(mockExporter.exportedObjects).toHaveLength(1);
      expect(mockExporter.exportedObjects[0]).toMatchObject(objects[0]);
    });
    
    it('should handle export failures', async () => {
      const objects: EnrichedRegisteredObject[] = [
        {
          name: 'test-object',
          id: 'obj-123',
          fields: { key: 'value' },
          project_name: 'test-project',
          sdk_version: '2',
          commit_sha: 'abc123'
        }
      ];
      
      mockExporter.shouldSucceed = false;
      mockExporter.errorMessage = 'Object export failed';
      
      const result = await mockExporter.exportObjects(objects);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Object export failed');
      expect(result.itemsExported).toBe(0);
      expect(mockExporter.exportedObjects).toHaveLength(0);
    });
    
    it('should handle empty objects array', async () => {
      const result = await mockExporter.exportObjects([]);
      
      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(0);
      expect(mockExporter.exportedObjects).toHaveLength(0);
    });
  });
  
  describe('reset', () => {
    it('should reset mock state', async () => {
      const logs: EnrichedLogEntry[] = [
        {
          message: 'Test log',
          level: 'info',
          timestamp: Date.now(),
          msg: 'Test log',
          lvl: 'info',
          ts: Date.now(),
          project_name: 'test-project',
          sdk_version: '2'
        }
      ];
      
      await mockExporter.exportLogs(logs);
      mockExporter.shouldSucceed = false;
      
      mockExporter.reset();
      
      expect(mockExporter.exportedLogs).toHaveLength(0);
      expect(mockExporter.exportedObjects).toHaveLength(0);
      expect(mockExporter.shouldSucceed).toBe(true);
      expect(mockExporter.errorMessage).toBe('Mock export error');
    });
  });
});