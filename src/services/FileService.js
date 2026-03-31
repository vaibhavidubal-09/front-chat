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

  const uploadedPath = `${response.data || ""}`.trim();

  if (/^https?:\/\//i.test(uploadedPath)) {
    return uploadedPath;
  }

  if (uploadedPath.startsWith("/")) {
    return `${httpClient.defaults.baseURL}${uploadedPath}`;
  }

  return `${httpClient.defaults.baseURL}/${uploadedPath}`;
};
