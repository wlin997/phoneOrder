import React from "react";
import RolePermissionGrid from "./admin/RolePermissionGrid.jsx";
import UserRoleTable from "./admin/UserRoleTable.jsx";

const RoleManager = () => (
  <div className="space-y-10">
     <h1 className="text-red-500">RoleManager Component Loaded</h1>
        <h2 className="text-2xl font-bold">Role ⇄ Permission Matrix</h2>
        <RolePermissionGrid />

        <h2 className="text-2xl font-bold">User ⇄ Role Assignment</h2>
        <UserRoleTable />
  </div>
);

export default RoleManager;
