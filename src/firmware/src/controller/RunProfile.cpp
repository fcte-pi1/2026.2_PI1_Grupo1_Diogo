#include "controller/RunProfile.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

RunProfile::RunProfile(double distance, const ProfileLimits& limits) noexcept : limits_(limits) {
    if (!(distance > 0.0) || !(limits.maxSpeed > 0.0) || !(limits.acceleration > 0.0)) {
        target_ = distance > 0.0 ? distance : 0.0;
        return;
    }
    plan(0.0, 0.0, distance);
}

void RunProfile::plan(double fromPosition, double fromSpeed, double target) noexcept {
    preT_ = 0.0;
    const double ceiling = limits_.maxSpeed;
    if (fromSpeed > ceiling * 1.02) {
        const double decelDistance = (fromSpeed * fromSpeed - ceiling * ceiling) / (2.0 * limits_.acceleration);
        if (target - fromPosition > decelDistance) {
            preT_ = (fromSpeed - ceiling) / limits_.acceleration;
            preP0_ = fromPosition;
            preV0_ = fromSpeed;
            fromPosition += decelDistance;
            fromSpeed = ceiling;
        }
    }
    p0_ = fromPosition;
    v0_ = std::max(fromSpeed, 0.0);
    target_ = target;
    const double a = limits_.acceleration;
    const double distance = target - fromPosition;
    accel_ = a;
    decel_ = a;
    if (distance <= 0.0) {
        peak_ = v0_;
        t1_ = t2_ = 0.0;
        decel_ = v0_ > 0.0 ? a * kMaxBrakeFactor : a;
        t3_ = v0_ / decel_;
        total_ = t3_;
        return;
    }
    const double brake = v0_ * v0_ / (2.0 * a);
    if (brake >= distance) {
        // Só dá para frear: desaceleração exata para parar no alvo.
        peak_ = v0_;
        t1_ = t2_ = 0.0;
        decel_ = v0_ * v0_ / (2.0 * distance);
        t3_ = decel_ > 0.0 ? v0_ / decel_ : 0.0;
    } else {
        // Sobe (se der) até o pico e desce. O pico é o menor entre o cruzeiro e o do triângulo.
        const double triangle = std::sqrt((2.0 * a * distance + v0_ * v0_) / 2.0);
        peak_ = std::max(v0_, std::min(limits_.maxSpeed, triangle));
        t1_ = (peak_ - v0_) / a;
        const double up = (peak_ * peak_ - v0_ * v0_) / (2.0 * a);
        const double down = peak_ * peak_ / (2.0 * a);
        t2_ = peak_ > 0.0 ? std::max(0.0, distance - up - down) / peak_ : 0.0;
        t3_ = peak_ / a;
    }
    total_ = t1_ + t2_ + t3_;
}

RunProfile::RunProfile(double fromPosition, double fromSpeed, double target, const ProfileLimits& limits) noexcept
    : limits_(limits) {
    if (!(limits.maxSpeed > 0.0) || !(limits.acceleration > 0.0)) {
        target_ = target;
        p0_ = fromPosition;
        return;
    }
    plan(fromPosition, fromSpeed, target);
}

RunProfile::Sample RunProfile::at(double timeSeconds) const noexcept {
    double t = timeSeconds - start_;
    if (preT_ > 0.0) {
        if (t <= 0.0) {
            return {preP0_, preV0_, false};
        }
        if (t < preT_) {
            return {preP0_ + preV0_ * t - 0.5 * limits_.acceleration * t * t, preV0_ - limits_.acceleration * t,
                    false};
        }
        t -= preT_;
    }
    if (total_ <= 0.0 || t >= total_) {
        return {target_, 0.0, true};
    }
    if (t <= 0.0) {
        return {p0_, v0_, false};
    }
    if (t < t1_) {
        return {p0_ + v0_ * t + 0.5 * accel_ * t * t, v0_ + accel_ * t, false};
    }
    const double up = v0_ * t1_ + 0.5 * accel_ * t1_ * t1_;
    if (t < t1_ + t2_) {
        return {p0_ + up + peak_ * (t - t1_), peak_, false};
    }
    const double remaining = total_ - t;  // tempo até parar
    return {target_ - 0.5 * decel_ * remaining * remaining, decel_ * remaining, false};
}

bool RunProfile::retarget(double newTarget, double atTimeSeconds) noexcept {
    if (!(limits_.acceleration > 0.0)) {
        return false;
    }
    const Sample now = at(atTimeSeconds);
    const double remaining = newTarget - now.position;
    if (remaining < 0.0) {
        return false;
    }
    const double needed = remaining > 0.0 ? now.speed * now.speed / (2.0 * remaining) : 1e12;
    if (now.speed > 0.0 && needed > kMaxBrakeFactor * limits_.acceleration) {
        return false;  // não para a tempo
    }
    start_ = atTimeSeconds;
    plan(now.position, now.speed, newTarget);
    return true;
}

}  // namespace micromouse::controller
