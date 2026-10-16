#pragma once

#include "driver/pulse_cnt.h"

namespace micromouse::adapters {

class Encoders {
private:
    pcnt_unit_handle_t leftUnit_{nullptr};
    pcnt_unit_handle_t rightUnit_{nullptr};

public:
    void begin();
    [[nodiscard]] long left() const;
    [[nodiscard]] long right() const;
    void reset();
};

}  // namespace micromouse::adapters
