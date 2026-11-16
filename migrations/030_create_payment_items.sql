
-- DB-12: 결제 메뉴 상세 테이블

CREATE TABLE payment_items (
    id BIGINT UNSIGNED NOT NULL
        AUTO_INCREMENT PRIMARY KEY,

    -- 소속 결제
    payment_id BIGINT UNSIGNED NOT NULL,

    -- 구매한 원본 메뉴
    menu_id BIGINT UNSIGNED NOT NULL,

    -- 결제 내 메뉴 순서 (1~20)
    line_no SMALLINT NOT NULL
        CHECK (line_no BETWEEN 1 AND 20),

    -- 결제 당시 메뉴 이름
    menu_name VARCHAR(30) NOT NULL,

    -- 결제 당시 단가
    unit_price BIGINT NOT NULL
        CHECK (unit_price BETWEEN 1 AND 100000),

    -- 구매 수량
    quantity INT NOT NULL
        CHECK (quantity BETWEEN 1 AND 20),

    -- 메뉴별 결제 금액
    amount BIGINT NOT NULL,

    -- 공통 컬럼
    created_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3),

    updated_at TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    deleted_at TIMESTAMP(3) NULL,

    -- 결제 외래 키
    CONSTRAINT fk_payment_items_payment
        FOREIGN KEY (payment_id)
        REFERENCES payments(id)
        ON DELETE RESTRICT,

    -- 메뉴 외래 키
    CONSTRAINT fk_payment_items_menu
        FOREIGN KEY (menu_id)
        REFERENCES menus(id)
        ON DELETE RESTRICT
);
