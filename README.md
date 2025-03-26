# SNS 이미지 및 상품 정보 연동 작업

## 1. 프론트엔드 작업

### SNS 이미지 및 상품 정보 연동 화면 구현
- **UI 설계**: 사용자가 SNS에 등록된 이미지를 확인할 수 있도록 직관적인 인터페이스 구성
- **상세 정보 모달/팝업**: 
  - 이미지를 클릭 시, 해당 상품의 상세 정보(가격, 설명 등)를 표시하는 모달 창 또는 팝업 창 구현
  - 팝업 클릭 시, 관련 데이터 정보 불러오기 기능 연동
- **관리자 기능**: 
  - 마스터 아이디로 로그인한 관리자가 SNS 이미지와 상품을 쉽게 연결할 수 있도록 드래그 앤 드롭 또는 선택 후 등록 기능 구현

### 상품 등록 및 정보 관리 화면 구현
- **입력 폼 제공**: 관리자가 상품 정보를 입력 및 수정할 수 있는 폼 제공
- **매핑 인터페이스**: SNS 이미지와 상품 정보를 연동할 수 있도록 상품 코드 및 상세 정보 관리 인터페이스 설계

### 장바구니/구매하기 기능 구현
- **구매하기 버튼**: 
  - 상품 정보 페이지 내 ‘구매하기’ 버튼 클릭 시, 페이지 이동 없이 바로 구매가 가능하도록 JavaScript 기반 비동기 처리(AJAX 또는 Fetch API) 적용
- **장바구니 추가 기능**: 
  - 장바구니에 상품을 추가할 수 있는 버튼 구현
  - 버튼 클릭 시, 페이지 이동 없이 UI 업데이트 및 서버 요청 처리를 비동기 방식으로 구현

## 2. 백엔드 작업

### 데이터베이스 설계 및 관리
- **테이블 설계**: SNS 이미지와 상품을 연결하는 데이터베이스 테이블 설계
  - 예시: Images 테이블과 Products 테이블 간의 관계 설정 및 이미지 고유 ID와 상품 코드(마스터 아이디)를 매핑
- **API 엔드포인트 구현**: 
  - 상품 정보 및 이미지를 등록하고 관리할 수 있는 API 엔드포인트 생성
  - 이미 등록된 SNS 이미지와 상품을 연결하는 API 구현으로 프론트엔드 기능 지원

### 마스터 아이디를 통한 직원 권한 관리
- **로그인 및 인증 시스템**: 
  - 마스터 아이디를 통한 직원 로그인 및 인증 시스템 구축
- **권한 설정**: 
  - 직원별로 마스터 아이디에 접근할 수 있는 권한을 설정하여, SNS 이미지와 상품 연결 기능을 API로 제공

### 장바구니/구매 기능 API 구현
- **REST API 개발**: 
  - 페이지 이동 없이 바로 구매하기 또는 장바구니 추가 요청을 처리할 수 있는 REST API 구현
- **주문 및 기록 관리**: 
  - 주문 생성 시 주문 데이터 처리 및 장바구니 추가 여부 기록하는 로직 작성
- **결제 연동**: 
  - 상품 구매 시 결제 처리를 위한 결제 관련 API 연동 및 로직 구성
- **비동기 요청 처리**: 
  - 프론트엔드에서 비동기 요청을 처리하고, 응답 데이터를 활용할 수 있도록 API 설계
## 참고 링크
- [SNS 이미지 및 상품 정보 연동, 구매 편의성 페이지](https://yogibo.kr/event/yogiyogi.html)




![image](https://github.com/user-attachments/assets/1933f6df-e1e6-423d-87fa-81aa59e5a35a)
![image](https://github.com/user-attachments/assets/e4d20721-fe43-4264-b2f1-7f584377f291)
