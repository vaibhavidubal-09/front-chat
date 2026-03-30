// import { httpClient } from "../config/AxiosHelper";

// export const uploadFileApi = async (file) => {
//   const formData = new FormData();
//   formData.append("file", file);

//   const response = await httpClient.post("/api/v1/files/upload", formData, {
//     headers: { "Content-Type": "multipart/form-data" }
//   });

//   return response.data; // returns URL of uploaded file
// };
import { httpClient } from "../config/AxiosHelper";

export const uploadFileApi = async (file) => {

  const formData = new FormData();
  formData.append("file", file);

  const response = await httpClient.post(
    "/api/v1/files/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return `${httpClient.defaults.baseURL}${response.data}`;
};