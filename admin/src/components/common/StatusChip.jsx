import Chip from '@mui/material/Chip';
import {
  ORDER_STATUS_COLOR,
  PAYMENT_STATUS_COLOR,
  PRODUCT_STATUS_COLOR,
} from '../../utils/constants';
import { titleCase } from '../../utils/format';

const PALETTES = {
  order: ORDER_STATUS_COLOR,
  payment: PAYMENT_STATUS_COLOR,
  product: PRODUCT_STATUS_COLOR,
  user: { active: 'success', blocked: 'error' },
  role: { admin: 'primary', user: 'default' },
};

export default function StatusChip({ status, kind = 'order', size = 'small', ...rest }) {
  const color = PALETTES[kind]?.[status] || 'default';
  return <Chip label={titleCase(status)} color={color} size={size} variant="filled" {...rest} />;
}
