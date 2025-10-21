const message =
  'The "pg" package is not installed. Install it to enable database access, or provide a compatible implementation.';

class StubPoolClient {
  async query() {
    throw new Error(message);
  }

  release() {
    // no-op for stub
  }
}

class StubPool {
  constructor() {
    this._client = new StubPoolClient();
  }

  async connect() {
    throw new Error(message);
  }

  async query() {
    throw new Error(message);
  }

  on() {
    return this;
  }

  async end() {}
}

module.exports = {
  Pool: StubPool,
  PoolClient: StubPoolClient,
};
