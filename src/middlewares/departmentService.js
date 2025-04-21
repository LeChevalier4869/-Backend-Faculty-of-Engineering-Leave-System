export const fetchDepartments = () => axios.get('/admin/departments').then(r=>r.data.data);
export const createDepartment = payload => axios.post('/admin/departments', payload).then(r=>r.data.data);
export const updateDepartment = (id, payload) => axios.put(`/admin/departments/${id}`, payload).then(r=>r.data.data);
export const deleteDepartment = id => axios.delete(`/admin/departments/${id}`);
