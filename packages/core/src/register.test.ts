import { TreebeardCore, register } from './index.js';

describe('Register Functionality', () => {
  let core: TreebeardCore;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    // Clear singleton
    (TreebeardCore as any).instance = null;
    
    // Mock fetch
    fetchMock = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({})
    });
    global.fetch = fetchMock;
    
    // Mock console to avoid test output clutter
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Initialize core
    core = TreebeardCore.init({ 
      apiKey: 'test-key', 
      batchSize: 1
    });
  });

  afterEach(async () => {
    await core.shutdown();
    jest.restoreAllMocks();
  });

  describe('TreebeardCore.register (static method)', () => {
    it('should register a simple object with id', () => {
      const testObject = {
        id: 'test-123',
        name: 'test-object',
        status: 'active',
        count: 42
      };

      TreebeardCore.register(testObject);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.treebeardhq.com/objects/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          }),
          body: expect.stringContaining('"objects"')
        })
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects).toHaveLength(1);
      expect(callBody.objects[0]).toEqual({
        name: 'test-object',
        id: 'test-123',
        fields: {
          status: 'active',
          count: 42
        }
      });
    });

    it('should register multiple objects via record syntax', () => {
      const user = { id: 'user-123', email: 'user@example.com', age: 30 };
      const product = { id: 'product-456', name: 'laptop', price: 999.99 };

      TreebeardCore.register({ user, product });

      expect(fetchMock).toHaveBeenCalledTimes(2); // Two separate calls for batch size 1

      const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);

      expect(firstCallBody.objects[0]).toEqual({
        name: 'user',
        id: 'user-123',
        fields: { email: 'user@example.com', age: 30 }
      });

      expect(secondCallBody.objects[0]).toEqual({
        name: 'product',
        id: 'product-456',
        fields: { price: 999.99 }
      });
    });

    it('should handle class instances', () => {
      class TestClass {
        id = 'class-123';
        property = 'value';
        count = 10;
      }

      const instance = new TestClass();
      TreebeardCore.register(instance);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects[0]).toEqual({
        name: 'testclass',
        id: 'class-123',
        fields: {
          property: 'value',
          count: 10
        }
      });
    });

    it('should use record key as name when provided', () => {
      const userObj = { id: 'user-789', email: 'test@example.com' };
      
      TreebeardCore.register({ user: userObj });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects[0]).toEqual({
        name: 'user',
        id: 'user-789',
        fields: { email: 'test@example.com' }
      });
    });

    it('should handle mixed record with explicit names', () => {
      const userObj = { id: 'user-100', name: 'explicit-user', email: 'user@test.com' };
      const productObj = { id: 'product-200', price: 50.00 };

      TreebeardCore.register({ user: userObj, product: productObj });

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const calls = fetchMock.mock.calls.map(call => 
        JSON.parse(call[1]?.body as string).objects[0]
      );

      // Find user and product calls
      const userCall = calls.find(obj => obj.id === 'user-100');
      const productCall = calls.find(obj => obj.id === 'product-200');

      expect(userCall).toEqual({
        name: 'user', // Record key takes precedence over explicit name
        id: 'user-100',
        fields: { email: 'user@test.com' } // explicit name field is filtered out
      });

      expect(productCall).toEqual({
        name: 'product',
        id: 'product-200',
        fields: { price: 50.00 }
      });
    });
  });

  describe('register export function', () => {
    it('should work as a standalone export with single object', () => {
      const testObject = {
        id: 'export-123',
        category: 'test',
        active: true
      };

      register(testObject);

      expect(fetchMock).toHaveBeenCalled();
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects[0]).toEqual({
        name: undefined,
        id: 'export-123',
        fields: {
          category: 'test',
          active: true
        }
      });
    });

    it('should work with record syntax', () => {
      const order = { id: 'order-123', total: 199.99 };
      const customer = { id: 'customer-456', email: 'test@example.com' };

      register({ order, customer });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      
      const calls = fetchMock.mock.calls.map(call => 
        JSON.parse(call[1]?.body as string).objects[0]
      );

      const orderCall = calls.find(obj => obj.id === 'order-123');
      const customerCall = calls.find(obj => obj.id === 'customer-456');

      expect(orderCall).toEqual({
        name: 'order',
        id: 'order-123',
        fields: { total: 199.99 }
      });

      expect(customerCall).toEqual({
        name: 'customer',
        id: 'customer-456',
        fields: { email: 'test@example.com' }
      });
    });
  });

  describe('Record vs Single Object Detection', () => {
    it('should treat objects with id as single objects', () => {
      const objectWithId = { id: 'single-123', name: 'test', value: 42 };
      
      TreebeardCore.register(objectWithId);
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects[0]).toEqual({
        name: 'test',
        id: 'single-123',
        fields: { value: 42 }
      });
    });

    it('should treat plain objects without id as records', () => {
      const user = { id: 'user-123', email: 'user@test.com' };
      const product = { id: 'product-456', price: 99.99 };
      
      TreebeardCore.register({ user, product });
      
      expect(fetchMock).toHaveBeenCalledTimes(2);
      
      const calls = fetchMock.mock.calls.map(call => 
        JSON.parse(call[1]?.body as string).objects[0]
      );

      expect(calls).toEqual(
        expect.arrayContaining([
          { name: 'user', id: 'user-123', fields: { email: 'user@test.com' } },
          { name: 'product', id: 'product-456', fields: { price: 99.99 } }
        ])
      );
    });

    it('should treat class instances as single objects', () => {
      class TestRecord {
        constructor() {
          // No id field - but still should be treated as single object
        }
      }
      
      const instance = new TestRecord();
      TreebeardCore.register(instance);
      
      // Should not make any calls since no id field
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle empty objects gracefully', () => {
      TreebeardCore.register({});
      
      // Empty object has no properties, so no registrations
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Object validation and formatting', () => {
    it('should reject objects without id', () => {
      const objectWithoutId = { name: 'no-id', value: 123 };
      TreebeardCore.register(objectWithoutId);

      // No fetch call should be made
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should filter invalid field types', () => {
      const testObject = {
        id: 'filter-123',
        validString: 'short',
        validNumber: 42,
        validBoolean: true,
        validDate: new Date('2023-01-01'),
        invalidLongString: 'x'.repeat(2000),
        invalidStringWithNewlines: 'line1\nline2',
        invalidObject: { nested: 'object' },
        invalidArray: [1, 2, 3],
        invalidFunction: () => 'test'
      };

      TreebeardCore.register(testObject);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects[0].fields).toEqual({
        validString: 'short',
        validNumber: 42,
        validBoolean: true,
        validDate: '2023-01-01T00:00:00.000Z'
      });
    });

    it('should handle null and undefined values', () => {
      TreebeardCore.register(null);
      TreebeardCore.register(undefined);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject non-object types', () => {
      TreebeardCore.register('string');
      TreebeardCore.register(123);
      TreebeardCore.register(true);
      TreebeardCore.register([1, 2, 3]);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Context attachment', () => {
    it('should attach object to context when name and id are available', () => {
      const testObject = {
        id: 'context-123',
        name: 'user'
      };

      // Mock TreebeardContext
      const mockContext = { traceId: 'trace-123' };
      const mockGetStore = jest.fn().mockReturnValue(mockContext);
      const mockRun = jest.fn();
      
      const TreebeardContext = require('./context.js').TreebeardContext;
      TreebeardContext.getStore = mockGetStore;
      TreebeardContext.run = mockRun;

      TreebeardCore.register(testObject);

      // Context should be updated with object reference
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'context-123'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Batch handling', () => {
    it('should flush objects when batch is full', () => {
      // Create core with larger batch size
      core.shutdown();
      (TreebeardCore as any).instance = null;
      core = TreebeardCore.init({ 
        apiKey: 'test-key', 
        batchSize: 2 
      });

      // Register first object - should not flush
      TreebeardCore.register({ id: 'batch-1', name: 'first' });
      expect(fetchMock).not.toHaveBeenCalled();

      // Register second object - should flush
      TreebeardCore.register({ id: 'batch-2', name: 'second' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.objects).toHaveLength(2);
    });

    it('should include project metadata in requests', () => {
      core.shutdown();
      (TreebeardCore as any).instance = null;
      core = TreebeardCore.init({ 
        apiKey: 'test-key',
        projectName: 'test-project',
        batchSize: 1
      });

      TreebeardCore.register({ id: 'meta-123' });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody).toEqual(
        expect.objectContaining({
          project_name: 'test-project',
          sdk_version: '2'
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error');

      TreebeardCore.register({ id: 'error-123' });

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Treebeard]: Error sending objects:',
        expect.any(Error)
      );
    });

    it('should handle HTTP errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });
      const consoleSpy = jest.spyOn(console, 'error');

      TreebeardCore.register({ id: 'http-error-123' });

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Treebeard]: Failed to send objects: 500 Internal Server Error'
      );
    });

    it('should skip registration when no API key is provided', () => {
      core.shutdown();
      (TreebeardCore as any).instance = null;
      core = TreebeardCore.init({ batchSize: 1 }); // No API key

      TreebeardCore.register({ id: 'no-key-123' });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});