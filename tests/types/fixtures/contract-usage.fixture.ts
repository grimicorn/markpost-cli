// Fixture exercising the CLI's real usage patterns against the vendored
// markpost contract (src/types/vendor/markpost-api.types.ts). This mirrors
// how src/types/records.types.ts and src/types/sources.types.ts actually
// build resource + response types on top of the vendored contract.
//
// It is compiled (not executed) by tests/types/contract-drift.test.ts via
// the TypeScript compiler API. If the vendored contract's shape changes in a
// way that breaks these usages, that test fails.
import type {
  ApiRequest,
  ApiResourceObject,
  ApiResponse,
} from '../../../src/types/vendor/markpost-api.types';

type FixtureAttributes = {
  uuid: string;
  title: string;
};

type FixtureResource = ApiResourceObject & {
  type: 'fixtures';
  attributes: FixtureAttributes;
};

const singleResponse: ApiResponse<FixtureResource | null> = {
  data: {
    type: 'fixtures',
    id: 'abc-123',
    attributes: { uuid: 'abc-123', title: 'Hello' },
    links: { self: '/api/fixtures/abc-123' },
  },
};

const listResponse: ApiResponse<FixtureResource[]> = {
  data: [],
  meta: { total: 0 },
  links: { next: null, prev: null },
};

const errorResponse: ApiResponse<FixtureResource[]> = {
  errors: [{ status: '404', title: 'Not Found', detail: 'missing' }],
};

const createRequestBody: ApiRequest = {
  data: {
    attributes: { title: 'Hello' },
  },
};

export { singleResponse, listResponse, errorResponse, createRequestBody };
