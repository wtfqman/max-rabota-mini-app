import type { ProductType } from '../features/products/create-product.types.js';
import { SimpleCreateAdPage } from './SimpleCreateAdPage.js';

export function CreateProductPage({ type }: { type: ProductType }) {
  return <SimpleCreateAdPage kind={type} />;
}
