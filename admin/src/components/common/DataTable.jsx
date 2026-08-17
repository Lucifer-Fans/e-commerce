import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Skeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';
import EmptyState from './EmptyState';
import Pagination from './Pagination';

/**
 * Reusable server-paginated table.
 *
 * @param {Array<{key:string, label:string, width?:number|string, align?:string,
 *                render?:(row:any)=>React.ReactNode}>} columns
 * @param {'top'|'middle'} verticalAlign  When cells stack two lines of text, centring
 *   every cell against the tallest one reads as ragged; `top` puts the first line of
 *   every column on the same baseline instead.
 */
export default function DataTable({
  columns,
  rows = [],
  loading = false,
  page = 1,
  limit = 10,
  total = 0,
  onPageChange,
  onLimitChange,
  emptyTitle = 'No records found',
  emptyMessage,
  emptyAction,
  getRowId = (row) => row._id,
  onRowClick,
  toolbar,
  verticalAlign = 'middle',
}) {
  const showEmpty = !loading && rows.length === 0;

  return (
    <Card>
      {toolbar}

      <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
        <Table stickyHeader size="medium">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align || 'left'}
                  sx={{
                    width: column.width,
                    minWidth: column.minWidth,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {loading &&
              Array.from({ length: Math.min(limit, 8) }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <Skeleton variant="text" height={26} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading &&
              rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  hover
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  sx={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      align={column.align || 'left'}
                      sx={{
                        width: column.width,
                        minWidth: column.minWidth,
                        verticalAlign,
                      }}
                    >
                      {column.render ? column.render(row) : (row[column.key] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      {showEmpty && (
        <EmptyState
          title={emptyTitle}
          message={emptyMessage}
          actionLabel={emptyAction?.label}
          onAction={emptyAction?.onClick}
        />
      )}

      {!showEmpty && onPageChange && (
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <Pagination
            page={page}
            limit={limit}
            total={total}
            onPageChange={onPageChange}
            onLimitChange={onLimitChange}
          />
        </Box>
      )}
    </Card>
  );
}
