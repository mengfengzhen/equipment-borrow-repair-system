export type User = {
  id: string;
  username: string;
  name: string;
  role: string;
  departmentId?: string | null;
  department?: string | { id: string; name: string };
  phone?: string;
  email?: string;
  active?: boolean;
};

export type Department = {
  id: string;
  name: string;
};

export type Device = {
  id: string;
  name: string;
  code: string;
  type: string;
  brand?: string;
  model?: string;
  location: string;
  status: string;
  purchaseDate?: string;
  warrantyExpireDate?: string;
  value?: number;
  description?: string;
  owner?: { id: string; name: string; username?: string };
  currentBorrower?: { id: string; name: string; username?: string };
  currentRepair?: {
    id: string;
    status: string;
    result?: string;
    repairer?: { id: string; name: string; username?: string };
  };
};

export type BorrowRequest = {
  id: string;
  status: string;
  requestedName: string;
  requestedType: string;
  requestedBrand?: string;
  requestedModel?: string;
  quantity: number;
  borrowStartAt: string;
  borrowEndAt: string;
  purpose: string;
  remark?: string;
  attachmentNames?: string;
  pickedUpAt?: string;
  returnedAt?: string;
  returnCondition?: string;
  returnRemark?: string;
  returnLocation?: string;
  device?: Device;
  items?: Array<{
    id: string;
    status: string;
    pickedUpAt?: string;
    returnedAt?: string;
    returnCondition?: string;
    returnRemark?: string;
    returnLocation?: string;
    device: Device;
  }>;
  applicant: { id: string; name: string; username?: string };
  department?: { id: string; name: string };
  approvals?: Array<{
    id: string;
    result: string;
    comment: string;
    createdAt: string;
    approver: { id: string; name: string; role: string };
  }>;
};

export type RepairRecord = {
  id: string;
  status: string;
  faultDescription: string;
  result?: string;
  cost?: number;
  repairStartAt: string;
  repairEndAt?: string;
  device: Device;
  repairer?: { id: string; name: string; username?: string };
  borrowRequest?: BorrowRequest;
};
