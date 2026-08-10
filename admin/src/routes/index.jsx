import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import ErrorPage from '../pages/ErrorPage';

const Login = lazy(() => import('../pages/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Products = lazy(() => import('../pages/Products'));
const ProductForm = lazy(() => import('../pages/ProductForm'));
const Categories = lazy(() => import('../pages/Categories'));
const Brands = lazy(() => import('../pages/Brands'));
const Orders = lazy(() => import('../pages/Orders'));
const OrderDetail = lazy(() => import('../pages/OrderDetail'));
const CancellationReasons = lazy(() => import('../pages/CancellationReasons'));
const Users = lazy(() => import('../pages/Users'));
const Banners = lazy(() => import('../pages/Banners'));
const Coupons = lazy(() => import('../pages/Coupons'));
const Inquiries = lazy(() => import('../pages/Inquiries'));
const Settings = lazy(() => import('../pages/Settings'));
const NotFound = lazy(() => import('../pages/NotFound'));

export const router = createBrowserRouter([
  { path: '/login', element: <Login />, errorElement: <ErrorPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    // Catches anything the in-layout boundary can't: a crash in the layout or
    // guard itself, a failed route chunk, a loader throw.
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'products', element: <Products /> },
      { path: 'products/new', element: <ProductForm /> },
      { path: 'products/:id/edit', element: <ProductForm /> },
      { path: 'categories', element: <Categories /> },
      { path: 'brands', element: <Brands /> },
      { path: 'orders', element: <Orders /> },
      { path: 'orders/:id', element: <OrderDetail /> },
      { path: 'cancellation-reasons', element: <CancellationReasons /> },
      { path: 'users', element: <Users /> },
      { path: 'banners', element: <Banners /> },
      { path: 'coupons', element: <Coupons /> },
      { path: 'inquiries', element: <Inquiries /> },
      { path: 'settings', element: <Settings /> },
      // Show a real 404 inside the shell rather than silently bouncing to /.
      { path: '*', element: <NotFound /> },
    ],
  },
]);
