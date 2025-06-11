import React, { useRef } from 'react';
import { Link } from 'react-router-dom';

const NavMenu = ({ isMenuOpen, handleMenuClose }) => {
  const menuRef = useRef(null);

  if (!isMenuOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed top-16 right-4 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-40"
      onMouseLeave={handleMenuClose}
    >
      <a
        href="/"
        className="block px-4 py-2 text-sm text-gray-700 hover:text-[#81d4e6] hover:bg-gray-100"
        onClick={handleMenuClose}
      >
        ORDER
      </a>
      <Link
        to="/report"
        className="block px-4 py-2 text-sm text-gray-700 hover:text-[#81d4e6] hover:bg-gray-100"
        onClick={handleMenuClose}
      >
        REPORT
      </Link>
      <Link
        to="/admin"
        className="block px-4 py-2 text-sm text-gray-700 hover:text-[#81d4e6] hover:bg-gray-100"
        onClick={handleMenuClose}
      >
        SETTING
      </Link>
      <a
        href="#"
        className="block px-4 py-2 text-sm text-gray-700 hover:text-[#81d4e6] hover:bg-gray-100"
        onClick={handleMenuClose}
      >
        LOGIN
      </a>
    </div>
  );
};

export default NavMenu;
