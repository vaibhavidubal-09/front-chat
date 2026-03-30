import { httpClient } from "../config/AxiosHelper";

// ============================================================
// CREATE CLASS (TEACHER)
// ============================================================
export const createRoomApi = async ({ roomName, email }) => {
  const response = await httpClient.post(`/api/v1/rooms/create`, {
    roomName,
    email
  });
  return response.data;
};

// ============================================================
// JOIN CLASS (STUDENT)
// ============================================================
export const joinRoomApi = async (roomId, email) => {
  const response = await httpClient.post("/api/v1/rooms/join", {
    roomId,
    email
  });
  return response.data;
};

// ============================================================
// 👩‍🏫 GET TEACHER CLASSES
// ============================================================
export const getTeacherClasses = async (email) => {
  const response = await httpClient.get(`/api/v1/rooms/teacher/${email}`);
  return response.data;
};

// ============================================================
// 👨‍🎓 GET STUDENT CLASSES
// ============================================================
export const getStudentClasses = async (email) => {
  const response = await httpClient.get(`/api/v1/rooms/student/${email}`);
  return response.data;
};

// ============================================================
// GET ROOM DETAILS
// ============================================================
export const getRoomApi = async (roomId) => {
  const response = await httpClient.get(`/api/v1/rooms/${roomId}`);
  return response.data;
};

// ============================================================
// GET MESSAGES
// ============================================================
export const getMessagesApi = async (roomId) => {
  const response = await httpClient.get(`/api/v1/rooms/${roomId}/messages`);
  return response.data;
};

export const getPrivateMessagesApi = async (roomId, userEmail, peerEmail) => {
  const response = await httpClient.get(`/api/v1/rooms/${roomId}/private-messages`, {
    params: {
      userEmail,
      peerEmail
    }
  });
  return response.data;
};

// ============================================================
// GET ROOM MEMBERS
// ============================================================
export const getRoomMembersApi = async (roomId) => {
  const response = await httpClient.get(`/api/v1/rooms/${roomId}`);
  const room = response.data;
  const activeStudents = room.students || [];
  const blockedStudents = room.blockedStudents || [];

  return [...activeStudents, ...blockedStudents]
    .filter((email, index, list) => list.indexOf(email) === index)
    .map((email) => ({
    email,
    blocked: blockedStudents.includes(email)
  }));
};

// ============================================================
// ADD STUDENT TO ROOM
// ============================================================
export const addStudentToRoomApi = async (roomId, teacherEmail, studentEmail) => {
  const response = await httpClient.post(`/api/v1/rooms/addStudent`, {
    roomId,
    teacherEmail,
    studentEmail
  });
  return response.data;
};

// ============================================================
// ACTIVATE BLOCKED STUDENT IN ROOM
// ============================================================
export const activateStudentInRoomApi = async (roomId, teacherEmail, studentEmail) => {
  const response = await httpClient.post(`/api/v1/rooms/activate`, {
    roomId,
    teacherEmail,
    studentEmail
  });
  return response.data;
};

// ============================================================
// BLOCK STUDENT IN ROOM
// ============================================================
export const blockStudentInRoomApi = async (roomId, teacherEmail, studentEmail) => {
  const response = await httpClient.post(`/api/v1/rooms/block`, {
    roomId,
    teacherEmail,
    studentEmail
  });
  return response.data;
};
